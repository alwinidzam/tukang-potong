import { Router, Request, Response, NextFunction } from 'express';
import {
  db,
  User,
  QueueItem,
  Transaction,
  MasterHPP,
  Service,
  NotificationLog,
  getJakartaDateStr,
  compareQueueFIFO,
} from './db.js';
import { HPPStockBatch, aggregateAnalyticsSinglePass } from './algorithms.js';
import {
  authenticate,
  requireAuth,
  requireRole,
  AuthenticatedRequest,
  createSession,
  destroySession,
  destroyUserSessions,
  verifyPassword,
  hashPassword,
  isOwnerRole,
  isStaffRole,
} from './auth.js';
import {
  syncQueueToSupabase,
  deleteQueueFromSupabase,
  syncHPPToSupabase,
  deleteHPPFromSupabase,
  syncHPPBatchToSupabase,
  syncServiceToSupabase,
  deleteServiceFromSupabase,
  syncUserToSupabase,
  syncTransactionToSupabase,
  syncNotificationToSupabase,
} from './supabase.js';

const router = Router();

// Ensure Cloud sync hydration has completed (or timed out safely) before handling requests
router.use(async (_req: Request, _res: Response, next: NextFunction) => {
  await db.ensureSynced();
  next();
});

// Apply O(1) session authentication extractor across all routes
router.use((req: Request, res: Response, next: NextFunction) => {
  authenticate(req as AuthenticatedRequest, res, next);
});

// -------------------------------------------------------------
// Rate Limiting for Login Endpoints (Bounded IP Tracker)
// -------------------------------------------------------------
const loginAttempts = new Map<string, { count: number; blockedUntil: number; lastAttemptAt: number }>();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remainingSec: number } {
  const record = loginAttempts.get(ip);
  const now = Date.now();
  if (record && record.blockedUntil > now) {
    return { allowed: false, remainingSec: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  if (record && record.blockedUntil > 0 && record.blockedUntil <= now) {
    // Window expired cleanly
    loginAttempts.delete(ip);
  }
  return { allowed: true, remainingSec: 0 };
}

function recordFailedLogin(ip: string) {
  const now = Date.now();
  const prev = loginAttempts.get(ip);
  if (!prev || (prev.blockedUntil > 0 && prev.blockedUntil <= now) || now - prev.lastAttemptAt > 15 * 60 * 1000) {
    loginAttempts.set(ip, { count: 1, blockedUntil: 0, lastAttemptAt: now });
  } else {
    prev.count += 1;
    prev.lastAttemptAt = now;
    if (prev.count >= 5) {
      prev.blockedUntil = now + 60 * 1000;
    }
  }
}

function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.blockedUntil <= now && now - record.lastAttemptAt > 15 * 60 * 1000) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// -------------------------------------------------------------
// SSE Real-Time Clients Management (Capped & Memory Safe)
// -------------------------------------------------------------
const sseClients = new Set<Response>();
const MAX_SSE_CLIENTS = 500;

export function broadcastSSE(type: string, data: any) {
  const safeData = JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (key === 'password' || key === 'password_hash' || key === 'session_secret') {
        return undefined;
      }
      return value;
    })
  );

  const message = `data: ${JSON.stringify({ type, data: safeData, timestamp: new Date().toISOString() })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':keepalive\n\n');
    } catch (_) {
      sseClients.delete(client);
    }
  }
}, 30000);

function sanitizeUser(user: User) {
  return {
    id: user.id,
    role: user.role,
    status: user.status || 'ACTIVE',
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar_url: user.avatar_url,
    total_visits: user.total_visits,
    last_visit_at: user.last_visit_at,
    favorite_day: user.favorite_day,
    favorite_hour: user.favorite_hour,
    favorite_service: user.favorite_service,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at,
  };
}

// -------------------------------------------------------------
// 1. SSE Real-Time Endpoint (Authenticated Only)
// -------------------------------------------------------------
router.get('/events', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    return res.status(503).json({ error: 'Koneksi real-time penuh, coba sesaat lagi.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE stream established' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
  res.on('error', () => {
    sseClients.delete(res);
  });
});

// -------------------------------------------------------------
// 2. Authentication, Session Verification & SSO
// -------------------------------------------------------------

router.get('/auth/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      authenticated: false,
      user: null,
    });
  }

  // O(1) HashMap lookup
  const user = db.usersById.get(req.user.id);
  if (!user || user.status === 'INACTIVE' || user.deleted_at) {
    return res.status(401).json({
      authenticated: false,
      user: null,
    });
  }

  return res.json({
    authenticated: true,
    user: sanitizeUser(user),
  });
});

// POST /api/auth/owner-login: Owner & Staff secure login
router.post('/auth/owner-login', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${rateLimit.remainingSec} detik (Rate Limited).`,
      code: 'RATE_LIMITED',
    });
  }

  const { username, password } = req.body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username/Email dan password wajib diisi.' });
  }

  const cleanInput = username.trim().toLowerCase();
  const cleanInputNoSpace = cleanInput.replace(/\s+/g, '');
  const configuredUsername = (process.env.OWNER_USERNAME || 'CEO POTONG').toLowerCase();
  const configuredUsernameNoSpace = configuredUsername.replace(/\s+/g, '');

  // O(1) direct index lookup first, fallback to owner alias only for exact owner configured name
  let candidateUser =
    db.usersByUsername.get(cleanInput) ||
    db.usersByEmail.get(cleanInput) ||
    db.usersById.get(cleanInput);

  if (!candidateUser && cleanInputNoSpace === configuredUsernameNoSpace) {
    candidateUser = db.usersById.get('usr-admin');
  }

  if (!candidateUser) {
    const data = db.getData();
    candidateUser = data.users.find(
      (u) => u.username && u.username.toLowerCase().replace(/\s+/g, '') === cleanInputNoSpace
    );
  }

  if (candidateUser && (isOwnerRole(candidateUser.role) || isStaffRole(candidateUser.role))) {
    if (isOwnerRole(candidateUser.role)) {
      candidateUser.role = 'OWNER';
    } else if (isStaffRole(candidateUser.role)) {
      candidateUser.role = 'STAFF';
    }

    if (isOwnerRole(candidateUser.role) && !candidateUser.password_hash) {
      const defaultPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';
      candidateUser.password_hash = hashPassword(defaultPassword);
    }

    if (candidateUser.password_hash) {
      const verifyResult = verifyPassword(password, candidateUser.password_hash);
      if (verifyResult.valid) {
        if (candidateUser.status === 'INACTIVE' || candidateUser.deleted_at) {
          return res.status(403).json({
            error: 'Akun Anda dinonaktifkan oleh Owner. Silakan hubungi Owner untuk mengaktifkan kembali.',
            code: 'ACCOUNT_INACTIVE',
          });
        }

        resetLoginRateLimit(ip);
        candidateUser.last_login_at = new Date().toISOString();
        if (verifyResult.needsRehash) {
          candidateUser.password_hash = hashPassword(password);
        }
        db.saveData();
        await syncUserToSupabase(candidateUser);

        const session = createSession(candidateUser.id, candidateUser.role);
        res.cookie('arez_session', session.sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000,
          path: '/',
        });

        return res.json({
          success: true,
          user: sanitizeUser(candidateUser),
          token: session.sessionId,
        });
      }
    }
  }

  recordFailedLogin(ip);
  return res.status(401).json({
    error: 'Username/Email atau password salah. Pastikan kredensial yang dimasukkan sudah sesuai.',
    code: 'INVALID_CREDENTIALS',
  });
});

// POST /api/auth/google-sso: Customer Authentication ONLY (Strict Privilege Escalation Guard)
router.post('/auth/google-sso', async (req: Request, res: Response) => {
  const { google_id, email, full_name, avatar_url, phone } = req.body;

  if (!email || !full_name || typeof email !== 'string' || typeof full_name !== 'string') {
    return res.status(400).json({ error: 'Data pelanggan tidak lengkap (email dan nama wajib diisi).' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = full_name.trim();
  const data = db.getData();

  // O(1) HashMap lookup by email
  let user = db.usersByEmail.get(cleanEmail);

  // SECURITY FIX: Prevent customer SSO from ever logging into an existing OWNER or STAFF account
  if (user && (isOwnerRole(user.role) || isStaffRole(user.role))) {
    return res.status(403).json({
      error: 'Email ini terdaftar sebagai akun Owner/Staf. Silakan masuk melalui tab Owner & Staf dengan kata sandi.',
      code: 'PRIVILEGE_ESCALATION_BLOCKED',
    });
  }

  if (!user) {
    user = {
      id: `usr-cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      google_id: typeof google_id === 'string' ? google_id : `g-${Date.now()}`,
      full_name: cleanName,
      email: cleanEmail,
      phone: typeof phone === 'string' ? phone.trim() : '',
      avatar_url:
        typeof avatar_url === 'string'
          ? avatar_url
          : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}`,
      total_visits: 1,
      last_visit_at: new Date().toISOString(),
      favorite_day: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][
        new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
      ],
      favorite_hour: '15:00 - 18:00',
      favorite_service: 'Signature Haircut (Standard)',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    data.users.push(user);
    db.usersById.set(user.id, user);
    db.usersByEmail.set(cleanEmail, user);
  } else {
    user.full_name = cleanName;
    if (typeof avatar_url === 'string' && avatar_url) user.avatar_url = avatar_url;
    if (typeof phone === 'string' && phone) user.phone = phone.trim();
    user.updated_at = new Date().toISOString();
  }

  await db.saveDataAsync();
  await syncUserToSupabase(user);

  const session = createSession(user.id, 'CUSTOMER');

  res.cookie('arez_session', session.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return res.json({
    success: true,
    user: sanitizeUser(user),
    token: session.sessionId,
  });
});

router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionId) {
    destroySession(req.sessionId);
  }
  res.clearCookie('arez_session', { path: '/' });
  return res.json({ success: true, message: 'Berhasil logout' });
});

router.get('/auth/users', requireRole('OWNER'), (_req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  res.json(data.users.map(sanitizeUser));
});

// -------------------------------------------------------------
// 2.1 STAFF USER MANAGEMENT (Owner Only)
// -------------------------------------------------------------

router.get('/users/staff', requireRole('OWNER'), (_req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const staffList = data.users.filter((u) => u.role === 'STAFF' && !u.deleted_at);

  const total = staffList.length;
  let active = 0;
  let inactive = 0;
  for (const u of staffList) {
    if ((u.status || 'ACTIVE') === 'ACTIVE') active += 1;
    else inactive += 1;
  }

  res.json({
    staff: staffList.map(sanitizeUser),
    summary: { total, active, inactive },
  });
});

router.post('/users/staff', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { full_name, username, email, phone, password, status } = req.body;

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username wajib diisi.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : `${cleanUsername}@arezbarbershop.com`;
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const staffStatus: 'ACTIVE' | 'INACTIVE' = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  // O(1) uniqueness checks
  if (db.usersByUsername.has(cleanUsername)) {
    return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain. Gunakan username berbeda.' });
  }
  if (db.usersByEmail.has(cleanEmail)) {
    return res.status(409).json({ error: 'Email sudah terdaftar. Gunakan email lain.' });
  }

  const data = db.getData();
  const now = new Date().toISOString();
  const newStaff: User = {
    id: `usr-staff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    role: 'STAFF',
    status: staffStatus,
    username: cleanUsername,
    password_hash: hashPassword(password),
    full_name: full_name.trim(),
    email: cleanEmail,
    phone: cleanPhone,
    avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
    total_visits: 0,
    last_visit_at: null,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };

  data.users.push(newStaff);
  db.usersById.set(newStaff.id, newStaff);
  db.usersByUsername.set(cleanUsername, newStaff);
  db.usersByEmail.set(cleanEmail, newStaff);

  const staffNotif: NotificationLog = {
    id: `notif-staff-${Date.now()}`,
    user_id: req.user!.id,
    title: 'Akun Staff Dibuat',
    message: `Owner membuat akun staff baru: ${newStaff.full_name} (@${newStaff.username}) dengan status ${staffStatus}.`,
    type: 'SYSTEM',
    read: false,
    created_at: now,
  };
  data.notifications.push(staffNotif); // O(1) push

  await db.saveDataAsync();
  await syncUserToSupabase(newStaff);
  await syncNotificationToSupabase(staffNotif);

  broadcastSSE('STAFF_UPDATED', { action: 'CREATED', staff: sanitizeUser(newStaff) });

  res.status(201).json({
    success: true,
    user: sanitizeUser(newStaff),
    message: 'Akun staff berhasil dibuat.',
  });
});

router.get('/users/staff/:id', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.usersById.get(id);

  if (!user || user.role !== 'STAFF') {
    return res.status(404).json({ error: 'Data staff tidak ditemukan.' });
  }

  res.json({ user: sanitizeUser(user) });
});

router.patch('/users/staff/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { full_name, username, email, phone, status } = req.body;

  const user = db.usersById.get(id);
  if (!user) {
    return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  }
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Akun Owner tidak dapat diubah melalui endpoint Staff.' });
  }

  if (typeof full_name === 'string' && full_name.trim()) {
    user.full_name = full_name.trim();
  }

  if (typeof username === 'string' && username.trim()) {
    const cleanU = username.trim().toLowerCase();
    const clash = db.usersByUsername.get(cleanU);
    if (clash && clash.id !== id) {
      return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
    }
    if (user.username) db.usersByUsername.delete(user.username.toLowerCase());
    user.username = cleanU;
    db.usersByUsername.set(cleanU, user);
  }

  if (typeof email === 'string' && email.trim()) {
    const cleanE = email.trim().toLowerCase();
    const clash = db.usersByEmail.get(cleanE);
    if (clash && clash.id !== id) {
      return res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
    }
    if (user.email) db.usersByEmail.delete(user.email.toLowerCase());
    user.email = cleanE;
    db.usersByEmail.set(cleanE, user);
  }

  if (phone !== undefined) {
    user.phone = typeof phone === 'string' ? phone.trim() : '';
  }

  if (status === 'ACTIVE' || status === 'INACTIVE') {
    user.status = status;
    if (status === 'INACTIVE') {
      destroyUserSessions(id);
    }
  }

  user.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncUserToSupabase(user);

  broadcastSSE('STAFF_UPDATED', { action: 'UPDATED', staff: sanitizeUser(user) });

  res.json({
    success: true,
    user: sanitizeUser(user),
    message: 'Data staff berhasil diperbarui.',
  });
});

router.patch('/users/staff/:id/status', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return res.status(400).json({ error: 'Status harus bernilai ACTIVE atau INACTIVE.' });
  }

  const user = db.usersById.get(id);
  if (!user) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Status Owner tidak dapat diubah.' });
  }

  user.status = status;
  user.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncUserToSupabase(user);

  if (status === 'INACTIVE') {
    destroyUserSessions(id);
  }

  broadcastSSE('STAFF_UPDATED', { action: 'STATUS_CHANGED', staff: sanitizeUser(user) });

  res.json({
    success: true,
    user: sanitizeUser(user),
    message: `Status staff ${user.full_name} berhasil diubah menjadi ${status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}.`,
  });
});

router.post('/users/staff/:id/reset-password', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  const user = db.usersById.get(id);
  if (!user) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Password Owner tidak dapat direset melalui endpoint staff.' });
  }

  user.password_hash = hashPassword(password);
  user.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncUserToSupabase(user);

  destroyUserSessions(id);

  res.json({
    success: true,
    message: `Password untuk staff ${user.full_name} berhasil diperbarui.`,
  });
});

router.delete('/users/staff/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const targetUser = db.usersById.get(id);

  if (!targetUser) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }
  if (isOwnerRole(targetUser.role)) {
    return res.status(403).json({ error: 'Akun Owner tidak dapat dinonaktifkan atau dihapus.' });
  }

  targetUser.status = 'INACTIVE';
  targetUser.deleted_at = new Date().toISOString();
  targetUser.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncUserToSupabase(targetUser);

  destroyUserSessions(id);

  broadcastSSE('STAFF_UPDATED', { action: 'DEACTIVATED', staff: sanitizeUser(targetUser) });

  res.json({
    success: true,
    message: `Akun staff ${targetUser.full_name} berhasil dinonaktifkan dan data riwayat tetap tersimpan aman.`,
  });
});

// -------------------------------------------------------------
// 3. FIFO Queue Pipeline (O(1) Enqueue, Peek, Dequeue, Skip + Indexed Joins)
// -------------------------------------------------------------

router.get('/queues', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const data = db.getData();
  const dateStr = (req.query.date as string) || getJakartaDateStr();
  const isPrivileged = isOwnerRole(req.user?.role) || isStaffRole(req.user?.role);

  // Single O(K) traversal of the Doubly-Linked FIFO Queue to compute exact rank & cumulative wait time
  const fifoWaitList = db.waitingFIFO.toArray();
  const fifoMetaById = new Map<string, { rank: number; aheadCount: number; waitMins: number }>();
  let cumulativeWait = 0;

  // Include remaining time of any active IN_PROGRESS sessions ahead (averaged per active chair or lead)
  for (let i = 0; i < fifoWaitList.length; i++) {
    const wq = fifoWaitList[i];
    const srv = db.servicesById.get(wq.service_id);
    const dur = srv?.duration_mins || wq.service_duration || 18;
    fifoMetaById.set(wq.id, {
      rank: i + 1,
      aheadCount: i,
      waitMins: cumulativeWait,
    });
    cumulativeWait += dur;
  }

  const headItem = db.waitingFIFO.peek(); // O(1)

  const queues = (data.queues || [])
    .filter((q) => q.queue_date === dateStr || q.status === 'IN_PROGRESS' || q.status === 'WAITING')
    .map((q) => {
      // All O(1) HashMap lookups! Zero nested array.find() loops.
      const service = db.servicesById.get(q.service_id);
      const customer = q.customer_id ? db.usersById.get(q.customer_id) : null;
      const hpp = isPrivileged && service ? db.calculateServiceHPP(service.id) : undefined;
      const fifoMeta = fifoMetaById.get(q.id);
      const isSelf = req.user?.id && q.customer_id === req.user.id;

      return {
        ...q,
        service_name: service?.service_name || q.service_name || 'Signature Haircut',
        service_price: service?.selling_price ?? q.service_price ?? 50000,
        service_duration: service?.duration_mins ?? q.service_duration ?? 18,
        ...(isPrivileged ? { service_hpp: hpp } : {}),
        customer_name: customer ? customer.full_name : q.walk_in_name || q.customer_name || 'Walk-In Customer',
        ...(isPrivileged || isSelf
          ? {
              customer_avatar: customer?.avatar_url,
              customer_email: customer?.email,
              customer_phone: q.customer_phone || customer?.phone || null,
            }
          : {
              customer_phone: null,
            }),
        fifo_rank: fifoMeta ? fifoMeta.rank : null,
        is_fifo_head: Boolean(headItem && headItem.id === q.id),
        estimated_wait_mins: fifoMeta ? fifoMeta.waitMins : 0,
      };
    })
    .sort(compareQueueFIFO);

  const elapsedUs = Math.round((performance.now() - t0) * 1000);
  if (isPrivileged) {
    db.traceBuffer.push({
      domain: 'HASH_INDEX',
      operation: 'GET /api/queues',
      complexity: 'O(Q + K)',
      detail: `Mapped ${queues.length} queues via O(1) Map lookups + O(K) FIFO rank scan (Head: ${headItem ? '#' + headItem.queue_number : 'None'})`,
      duration_us: elapsedUs,
    });
  }

  res.json(queues);
});

// POST /api/queues: O(1) Enqueue into IndexedFIFOQueue
router.post('/queues', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { customer_id, walk_in_name, customer_phone, service_id, source, notes } = req.body;
  const data = db.getData();
  const todayStr = getJakartaDateStr();

  // O(1) service lookup
  const service = (service_id ? db.servicesById.get(service_id) : undefined) || data.services[0];
  if (!service) {
    return res.status(400).json({ error: 'Belum ada layanan aktif tersedia. Tambahkan layanan terlebih dahulu.' });
  }

  // IDOR Ownership Enforcement
  let verifiedCustomerId: string | null = null;
  if (req.user?.role === 'CUSTOMER') {
    verifiedCustomerId = req.user.id;
  } else if ((req.user?.role === 'OWNER' || req.user?.role === 'STAFF') && customer_id) {
    verifiedCustomerId = customer_id;
  }

  const cleanWalkInName = typeof walk_in_name === 'string' ? walk_in_name.trim() : null;
  const cleanPhone = typeof customer_phone === 'string' ? customer_phone.trim() : null;

  if (!verifiedCustomerId && !cleanWalkInName) {
    return res.status(400).json({ error: 'Nama pelanggan atau akun terdaftar wajib diisi.' });
  }

  const queueNumber = await db.getSafeQueueNumber(todayStr);
  const targetCustomer = verifiedCustomerId ? db.usersById.get(verifiedCustomerId) : null;
  const newQueue: QueueItem = {
    id: `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    queue_date: todayStr,
    queue_number: queueNumber,
    customer_id: verifiedCustomerId,
    walk_in_name: cleanWalkInName,
    customer_phone: cleanPhone,
    service_id: service.id,
    service_name: service.service_name,
    service_price: service.selling_price,
    service_duration: service.duration_mins,
    customer_name: targetCustomer ? targetCustomer.full_name : cleanWalkInName || 'Pelanggan',
    source: source === 'ONLINE' || source === 'WALK_IN' ? source : verifiedCustomerId ? 'ONLINE' : 'WALK_IN',
    status: 'WAITING',
    start_time: null,
    end_time: null,
    created_at: new Date().toISOString(),
    notes: typeof notes === 'string' ? notes.trim() : '',
  };

  // O(1) persistence + O(1) HashMap index + O(1) FIFO Enqueue at TAIL
  data.queues.push(newQueue);
  db.queuesById.set(newQueue.id, newQueue);
  db.waitingFIFO.enqueue(newQueue);

  const prevMax = db.maxQueueNumByDate.get(todayStr) || 0;
  if (queueNumber > prevMax) {
    db.maxQueueNumByDate.set(todayStr, queueNumber);
  }

  let notifToSync: NotificationLog | null = null;
  if (verifiedCustomerId) {
    notifToSync = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: verifiedCustomerId,
      title: `Nomor Antrean Anda: #${queueNumber}`,
      message: `Harap tiba di lokasi 15 menit sebelum giliran Anda dipanggil (FIFO #${db.waitingFIFO.size}). Layanan: ${service.service_name}`,
      type: 'REMINDER_15M',
      created_at: new Date().toISOString(),
      read: false,
    };
    data.notifications.push(notifToSync); // O(1) push
  }

  const elapsedUs = Math.round((performance.now() - t0) * 1000);
  db.traceBuffer.push({
    domain: 'QUEUE_FIFO',
    operation: 'ENQUEUE (TAIL)',
    complexity: 'O(1)',
    detail: `Antrean #${queueNumber} (${newQueue.customer_name}) masuk Tail FIFO. Panjang antrean: ${db.waitingFIFO.size}`,
    duration_us: elapsedUs,
  });

  db.saveData();
  await syncQueueToSupabase(newQueue);
  if (notifToSync) {
    await syncNotificationToSupabase(notifToSync);
  }
  broadcastSSE('QUEUE_ADDED', newQueue);

  res.status(201).json({
    success: true,
    queue: {
      ...newQueue,
      fifo_rank: db.waitingFIFO.size,
      is_fifo_head: db.waitingFIFO.peek()?.id === newQueue.id,
    },
  });
});

// POST /api/queues/:id/start: Hybrid Strict FIFO Dequeue in O(1)
router.post('/queues/:id/start', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const queue = db.queuesById.get(id); // O(1) lookup

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  if (queue.status === 'COMPLETED') {
    return res.status(400).json({ error: 'Antrean ini sudah selesai dan tidak dapat dimulai ulang.' });
  }

  if (queue.status === 'IN_PROGRESS') {
    return res.json({ success: true, queue });
  }

  // Hybrid Strict FIFO Enforcement:
  // If queue is WAITING, it MUST be the current FIFO HEAD (oldest waiting customer).
  // If front guest is absent, staff must explicitly click "Lewati (Skip)" first so FIFO Head advances cleanly!
  if (queue.status === 'WAITING') {
    const fifoHead = db.waitingFIFO.peek(); // O(1)
    if (fifoHead && fifoHead.id !== queue.id) {
      db.traceBuffer.push({
        domain: 'QUEUE_FIFO',
        operation: 'FIFO_ORDER_GUARD',
        complexity: 'O(1)',
        detail: `Ditolak memulai #${queue.queue_number} karena FIFO Head masih #${fifoHead.queue_number} (${fifoHead.customer_name})`,
        duration_us: Math.round((performance.now() - t0) * 1000),
      });
      return res.status(409).json({
        error: `Aturan Strict FIFO: Layani atau lewati tamu terdepan (#${fifoHead.queue_number} — ${fifoHead.customer_name}) sebelum memanggil #${queue.queue_number}.`,
        code: 'FIFO_ORDER_VIOLATION',
        expected_head: {
          id: fifoHead.id,
          queue_number: fifoHead.queue_number,
          customer_name: fifoHead.customer_name,
        },
      });
    }

    // O(1) Dequeue from Head
    db.waitingFIFO.dequeue();
  }

  queue.status = 'IN_PROGRESS';
  queue.start_time = new Date().toISOString();
  queue.end_time = null;

  const elapsedUs = Math.round((performance.now() - t0) * 1000);
  db.traceBuffer.push({
    domain: 'QUEUE_FIFO',
    operation: 'DEQUEUE (HEAD -> START)',
    complexity: 'O(1)',
    detail: `Memulai layanan #${queue.queue_number} (${queue.customer_name}). Sisa tunggu FIFO: ${db.waitingFIFO.size}`,
    duration_us: elapsedUs,
  });

  db.saveData();
  await syncQueueToSupabase(queue);
  broadcastSSE('QUEUE_STARTED', queue);

  res.json({ success: true, queue });
});

// POST /api/queues/:id/requeue: Return SKIPPED customer cleanly to FIFO Tail in O(1)
router.post('/queues/:id/requeue', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const queue = db.queuesById.get(id);

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }
  if (queue.status !== 'SKIPPED') {
    return res.status(400).json({ error: 'Hanya antrean berstatus Dilewati (SKIPPED) yang dapat dikembalikan ke antrean FIFO.' });
  }

  queue.status = 'WAITING';
  queue.end_time = null;
  db.waitingFIFO.enqueue(queue); // O(1) append to tail

  db.traceBuffer.push({
    domain: 'QUEUE_FIFO',
    operation: 'REQUEUE (SKIPPED -> TAIL)',
    complexity: 'O(1)',
    detail: `Mengembalikan #${queue.queue_number} (${queue.customer_name}) ke ekor antrean FIFO`,
    duration_us: Math.round((performance.now() - t0) * 1000),
  });

  db.saveData();
  await syncQueueToSupabase(queue);
  broadcastSSE('QUEUE_REQUEUED', queue);

  res.json({ success: true, queue });
});

// POST /api/queues/:id/complete: Complete session, deduct HPP batches via FIFO, record tx in O(1)
router.post('/queues/:id/complete', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const { discount = 0, tax = 0, payment_method = 'CASH', custom_price } = req.body;
  const data = db.getData();
  const queue = db.queuesById.get(id); // O(1) lookup

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  // O(1) double checkout protection via txByQueueId Map
  if (queue.status === 'COMPLETED') {
    const existingTx = db.txByQueueId.get(queue.id);
    if (existingTx) {
      return res.status(409).json({
        error: 'Transaksi untuk antrean ini telah diselesaikan sebelumnya (Mencegah Double Checkout).',
        transaction: existingTx,
      });
    }
  }

  // Remove from waiting FIFO if checked out directly from waiting state
  if (queue.status === 'WAITING') {
    db.waitingFIFO.remove(queue.id); // O(1)
  }

  const service = db.servicesById.get(queue.service_id); // O(1)
  const rawSellingPrice =
    custom_price !== undefined ? Number(custom_price) : service?.selling_price ?? queue.service_price ?? 50000;
  const sellingPrice = isNaN(rawSellingPrice) || rawSellingPrice < 0 ? 50000 : Math.round(rawSellingPrice);

  // Consume HPP materials across oldest FIFO stock batches!
  const { totalHPP, fifoBatchesUsed, modifiedBatches } = service
    ? db.consumeServiceMaterialsFIFO(service.id)
    : { totalHPP: 0, fifoBatchesUsed: [], modifiedBatches: [] };

  const rawDiscount = Number(discount);
  const numDiscount = isNaN(rawDiscount) || rawDiscount < 0 ? 0 : Math.round(rawDiscount);

  const rawTax = Number(tax);
  const numTax = isNaN(rawTax) || rawTax < 0 ? 0 : Math.round(rawTax);

  const finalPrice = Math.max(0, sellingPrice - numDiscount + numTax);
  const netProfit = finalPrice - totalHPP;

  const validPaymentMethods = ['CASH', 'QRIS', 'DEBIT', 'TRANSFER'];
  const validMethod = validPaymentMethods.includes(payment_method) ? payment_method : 'CASH';

  queue.status = 'COMPLETED';
  queue.end_time = new Date().toISOString();

  const customer = queue.customer_id ? db.usersById.get(queue.customer_id) : null; // O(1)
  const customerName = customer
    ? `${customer.full_name} (Online)`
    : `${queue.walk_in_name || queue.customer_name || 'Walk-In Customer'} (Walk-In)`;

  if (customer) {
    customer.total_visits = (customer.total_visits || 0) + 1;
    customer.last_visit_at = new Date().toISOString();
    customer.favorite_service = service?.service_name || customer.favorite_service;
  }

  const newTx: Transaction = {
    id: `trx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    queue_id: queue.id,
    customer_name: customerName,
    service_name: service?.service_name || queue.service_name || 'Signature Haircut',
    total_price: finalPrice,
    discount: numDiscount,
    tax: numTax,
    total_hpp: totalHPP,
    net_profit: netProfit,
    payment_method: validMethod,
    fifo_batches_used: fifoBatchesUsed,
    created_at: new Date().toISOString(),
  };

  data.transactions.push(newTx); // O(1) tail push instead of O(N) unshift
  db.txByQueueId.set(queue.id, newTx); // O(1)

  const elapsedUs = Math.round((performance.now() - t0) * 1000);
  db.traceBuffer.push({
    domain: 'HPP_BATCH_FIFO',
    operation: 'CHECKOUT_FIFO_COGS',
    complexity: 'O(R + B_pop)',
    detail: `Checkout #${queue.queue_number}: HPP Rp ${totalHPP.toLocaleString('id-ID')} (${fifoBatchesUsed.length} batch FIFO terpotong)`,
    duration_us: elapsedUs,
  });

  db.saveData();
  await syncQueueToSupabase(queue);
  if (customer) {
    await syncUserToSupabase(customer);
  }
  await syncTransactionToSupabase(newTx);
  for (const batch of modifiedBatches) {
    await syncHPPBatchToSupabase(batch);
  }

  broadcastSSE('QUEUE_COMPLETED', { queue, transaction: newTx });

  res.json({ success: true, queue, transaction: newTx });
});

// POST /api/queues/:id/skip: O(1) doubly-linked pointer unlink from FIFO waiting queue
router.post('/queues/:id/skip', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const queue = db.queuesById.get(id); // O(1)

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  db.waitingFIFO.remove(id); // O(1) pointer unlink!
  queue.status = 'SKIPPED';
  queue.end_time = new Date().toISOString();

  const nextWaiting = db.waitingFIFO.peek(); // O(1) peek new Head!

  db.traceBuffer.push({
    domain: 'QUEUE_FIFO',
    operation: 'SKIP_UNLINK',
    complexity: 'O(1)',
    detail: `Melewati #${queue.queue_number} (${queue.customer_name}). FIFO Head baru: ${nextWaiting ? '#' + nextWaiting.queue_number : 'Kosong'}`,
    duration_us: Math.round((performance.now() - t0) * 1000),
  });

  db.saveData();
  await syncQueueToSupabase(queue);
  broadcastSSE('QUEUE_SKIPPED', { skippedQueue: queue, nextWaiting });

  res.json({ success: true, skippedQueue: queue, nextWaiting });
});

// DELETE /api/queues/:id: IDOR-Protected O(1) FIFO unlink cancellation
router.delete('/queues/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const data = db.getData();
  const targetQueue = db.queuesById.get(id); // O(1)

  if (!targetQueue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  if (req.user!.role === 'CUSTOMER' && targetQueue.customer_id !== req.user!.id) {
    return res.status(403).json({ error: 'Akses ditolak: Anda hanya dapat membatalkan nomor antrean milik Anda sendiri.' });
  }

  db.waitingFIFO.remove(id); // O(1) pointer unlink
  db.queuesById.delete(id); // O(1)
  data.queues = data.queues.filter((q) => q.id !== id);

  db.traceBuffer.push({
    domain: 'QUEUE_FIFO',
    operation: 'CANCEL_UNLINK',
    complexity: 'O(1)',
    detail: `Antrean #${targetQueue.queue_number} dibatalkan dengan O(1) pointer unlink`,
    duration_us: Math.round((performance.now() - t0) * 1000),
  });

  db.saveData();
  await deleteQueueFromSupabase(id);
  broadcastSSE('QUEUE_DELETED', { id });

  res.json({ success: true });
});

// -------------------------------------------------------------
// 4. Master HPP CRUD + FIFO Stock Batches (Protected Role Access)
// -------------------------------------------------------------

router.get('/hpp', requireRole('OWNER', 'STAFF'), (_req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  // O(H + B) instead of O(H * R) nested scan
  const hppWithUsage = (data.master_hpp || []).map((item) => {
    const usedCount = db.hppUsageCount.get(item.id) || 0; // O(1)
    const batches = db.batchesByHppId.get(item.id) || []; // O(1) bucket access

    let totalStock = 0;
    let activeBatchesCount = 0;
    let fifoHeadUnitCost: number | null = null;
    for (const b of batches) {
      if (b.quantity_remaining > 0) {
        totalStock += b.quantity_remaining;
        activeBatchesCount += 1;
        if (fifoHeadUnitCost === null) {
          fifoHeadUnitCost = b.unit_cost;
        }
      }
    }

    return {
      ...item,
      category: item.category || 'Bahan Baku & Steril',
      is_active: item.is_active !== false,
      used_in_services_count: usedCount,
      total_stock: Number(totalStock.toFixed(2)),
      active_batches_count: activeBatchesCount,
      fifo_next_unit_cost: fifoHeadUnitCost ?? item.unit_cost,
      batches,
    };
  });

  res.json(hppWithUsage);
});

router.get('/hpp/:id/batches', requireRole('OWNER', 'STAFF'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const item = db.hppById.get(id);
  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }
  const batches = db.batchesByHppId.get(id) || [];
  res.json({ item, batches });
});

// POST /api/hpp/:id/batches: Receive incoming stock batch into FIFO Queue (O(1) tail insert)
router.post('/hpp/:id/batches', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const { id } = req.params;
  const { quantity, unit_cost, batch_code, notes } = req.body;

  const item = db.hppById.get(id);
  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  const qtyNum = Number(quantity);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    return res.status(400).json({ error: 'Jumlah stok masuk harus lebih dari 0.' });
  }

  const costNum = unit_cost !== undefined && unit_cost !== '' ? Number(unit_cost) : item.unit_cost;
  if (isNaN(costNum) || costNum < 0) {
    return res.status(400).json({ error: 'Harga beli per satuan tidak boleh negatif.' });
  }

  const data = db.getData();
  const existingBatches = db.batchesByHppId.get(id) || [];
  const nextSeq = existingBatches.length + 1;
  const cleanCode =
    typeof batch_code === 'string' && batch_code.trim()
      ? batch_code.trim().toUpperCase()
      : `FIFO-B${String(nextSeq).padStart(2, '0')}`;

  const newBatch: HPPStockBatch = {
    id: `batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    hpp_id: id,
    batch_code: cleanCode,
    quantity_initial: qtyNum,
    quantity_remaining: qtyNum,
    unit_cost: Math.round(costNum),
    received_at: new Date().toISOString(),
    notes: typeof notes === 'string' ? notes.trim() : '',
  };

  data.hpp_batches.push(newBatch); // O(1) push
  existingBatches.push(newBatch); // Chronological FIFO tail
  db.batchesByHppId.set(id, existingBatches);

  db.traceBuffer.push({
    domain: 'HPP_BATCH_FIFO',
    operation: 'BATCH_ENQUEUE (TAIL)',
    complexity: 'O(1)',
    detail: `Stok masuk ${cleanCode} (${item.item_name}): +${qtyNum} ${item.unit_type} @ Rp ${newBatch.unit_cost.toLocaleString('id-ID')}`,
    duration_us: Math.round((performance.now() - t0) * 1000),
  });

  await db.saveDataAsync();
  await syncHPPBatchToSupabase(newBatch);
  broadcastSSE('HPP_UPDATED', { action: 'BATCH_ADDED', hpp_id: id, batch: newBatch });

  res.status(201).json({
    success: true,
    batch: newBatch,
    message: `Batch stok "${cleanCode}" (+${qtyNum} ${item.unit_type}) berhasil ditambahkan ke antrean FIFO.`,
  });
});

router.get('/hpp/:id', requireRole('OWNER', 'STAFF'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const item = db.hppById.get(id);

  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  const relations = (data.service_hpp_relations || []).filter((r) => r.hpp_id === id);
  const usingServices = relations.map((r) => {
    const s = db.servicesById.get(r.service_id);
    return {
      service_id: r.service_id,
      service_name: s?.service_name || 'Unknown Service',
      quantity_used: r.quantity_used,
    };
  });

  res.json({
    ...item,
    category: item.category || 'Bahan Baku & Steril',
    is_active: item.is_active !== false,
    used_in_services_count: usingServices.length,
    using_services: usingServices,
    batches: db.batchesByHppId.get(id) || [],
  });
});

router.post('/hpp', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { item_name, unit_cost, unit_type, category, is_active, description, initial_stock } = req.body;

  if (!item_name || typeof item_name !== 'string' || !item_name.trim()) {
    return res.status(400).json({ error: 'Nama komponen HPP wajib diisi.' });
  }
  if (unit_cost === undefined || unit_cost === null) {
    return res.status(400).json({ error: 'Biaya per satuan wajib diisi.' });
  }

  const numCost = Number(unit_cost);
  if (isNaN(numCost) || numCost < 0) {
    return res.status(400).json({ error: 'Biaya per satuan harus berupa angka tidak negatif.' });
  }

  const cleanUnitType = typeof unit_type === 'string' && unit_type.trim() ? unit_type.trim() : 'pcs';
  const cleanCategory = typeof category === 'string' && category.trim() ? category.trim() : 'Bahan Baku & Steril';
  const cleanDesc = typeof description === 'string' ? description.trim() : '';
  const now = new Date().toISOString();

  const data = db.getData();
  const newItem: MasterHPP = {
    id: `hpp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    item_name: item_name.trim(),
    unit_cost: Math.round(numCost),
    unit_type: cleanUnitType,
    category: cleanCategory,
    is_active: is_active !== false,
    description: cleanDesc,
    created_at: now,
    updated_at: now,
  };

  data.master_hpp.push(newItem);
  db.hppById.set(newItem.id, newItem);
  db.batchesByHppId.set(newItem.id, []);

  // Optional initial FIFO stock batch when creating HPP
  let createdBatch: HPPStockBatch | null = null;
  const initStockNum = Number(initial_stock);
  if (!isNaN(initStockNum) && initStockNum > 0) {
    createdBatch = {
      id: `batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      hpp_id: newItem.id,
      batch_code: 'FIFO-B01',
      quantity_initial: initStockNum,
      quantity_remaining: initStockNum,
      unit_cost: newItem.unit_cost,
      received_at: now,
      notes: 'Stok Awal Pembukaan',
    };
    data.hpp_batches.push(createdBatch);
    db.batchesByHppId.set(newItem.id, [createdBatch]);
  }

  await db.saveDataAsync();
  await syncHPPToSupabase(newItem);
  if (createdBatch) {
    await syncHPPBatchToSupabase(createdBatch);
  }
  broadcastSSE('HPP_UPDATED', { action: 'CREATED', item: newItem });

  res.status(201).json({
    success: true,
    item: {
      ...newItem,
      used_in_services_count: 0,
      total_stock: createdBatch ? createdBatch.quantity_remaining : 0,
      active_batches_count: createdBatch ? 1 : 0,
      fifo_next_unit_cost: newItem.unit_cost,
      batches: createdBatch ? [createdBatch] : [],
    },
    message: `Komponen HPP "${newItem.item_name}" berhasil ditambahkan.`,
  });
});

const handleUpdateHPP = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { item_name, unit_cost, unit_type, category, is_active, description } = req.body;
  const item = db.hppById.get(id);

  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  if (typeof item_name === 'string' && item_name.trim()) {
    item.item_name = item_name.trim();
  }

  if (unit_cost !== undefined && unit_cost !== null) {
    const num = Number(unit_cost);
    if (!isNaN(num) && num >= 0) {
      item.unit_cost = Math.round(num);
    } else {
      return res.status(400).json({ error: 'Biaya per satuan harus berupa angka tidak negatif.' });
    }
  }

  if (typeof unit_type === 'string' && unit_type.trim()) {
    item.unit_type = unit_type.trim();
  }
  if (typeof category === 'string' && category.trim()) {
    item.category = category.trim();
  }
  if (is_active !== undefined) {
    item.is_active = Boolean(is_active);
  }
  if (description !== undefined) {
    item.description = typeof description === 'string' ? description.trim() : '';
  }

  item.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncHPPToSupabase(item);

  const usedCount = db.hppUsageCount.get(id) || 0;
  const enrichedItem = {
    ...item,
    used_in_services_count: usedCount,
  };

  broadcastSSE('HPP_UPDATED', { action: 'UPDATED', item: enrichedItem });

  res.json({
    success: true,
    item: enrichedItem,
    message: `Komponen HPP "${item.item_name}" berhasil diperbarui.`,
  });
};

router.put('/hpp/:id', requireRole('OWNER'), handleUpdateHPP);
router.patch('/hpp/:id', requireRole('OWNER'), handleUpdateHPP);

router.patch('/hpp/:id/status', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (is_active === undefined) {
    return res.status(400).json({ error: 'Status is_active wajib disertakan.' });
  }

  const item = db.hppById.get(id);
  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  item.is_active = Boolean(is_active);
  item.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncHPPToSupabase(item);

  const usedCount = db.hppUsageCount.get(id) || 0;
  const enrichedItem = {
    ...item,
    used_in_services_count: usedCount,
  };

  broadcastSSE('HPP_UPDATED', { action: 'STATUS_CHANGED', item: enrichedItem });

  res.json({
    success: true,
    item: enrichedItem,
    message: `Status komponen "${item.item_name}" diubah menjadi ${item.is_active ? 'Aktif' : 'Nonaktif'}.`,
  });
});

router.delete('/hpp/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true' || req.body?.force === true || req.body?.force === 'true';
    const data = db.getData();
    const targetItem = db.hppById.get(id);

    if (!targetItem) {
      return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
    }

    const usingRelations = (data.service_hpp_relations || []).filter((r) => r.hpp_id === id);

    if (usingRelations.length > 0 && !force) {
      const serviceNames = usingRelations.map((r) => {
        const s = db.servicesById.get(r.service_id);
        return s?.service_name || 'Layanan';
      });

      return res.status(409).json({
        error: `Komponen "${targetItem.item_name}" sedang digunakan dalam ${usingRelations.length} resep layanan (${serviceNames.slice(0, 2).join(', ')}${serviceNames.length > 2 ? '...' : ''}).`,
        requires_confirmation: true,
        used_in_services_count: usingRelations.length,
        service_names: serviceNames,
        recommendation: 'DEACTIVATE',
      });
    }

    data.service_hpp_relations = (data.service_hpp_relations || []).filter((r) => r.hpp_id !== id);
    data.master_hpp = (data.master_hpp || []).filter((h) => h.id !== id);
    data.hpp_batches = (data.hpp_batches || []).filter((b) => b.hpp_id !== id);
    db.rebuildIndexes();

    await db.saveDataAsync();
    await deleteHPPFromSupabase(id);
    broadcastSSE('HPP_UPDATED', { action: 'DELETED', deletedId: id });

    return res.json({
      success: true,
      message: `Komponen HPP "${targetItem.item_name}" berhasil dihapus.`,
    });
  } catch (err: any) {
    console.error('[DELETE /api/hpp/:id Error]:', err);
    return res.status(500).json({ error: err.message || 'Gagal menghapus komponen HPP' });
  }
});

// -------------------------------------------------------------
// 5. Services & Recipe Management (O(S + R) Indexed Join + Recipe Sync Fix)
// -------------------------------------------------------------

router.get('/services', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const isPrivileged = isOwnerRole(req.user?.role) || isStaffRole(req.user?.role);

  const servicesResponse = (data.services || []).map((s) => {
    if (!isPrivileged) {
      // Protect Owner's internal HPP cost & profit margins from customers
      return {
        id: s.id,
        service_name: s.service_name,
        selling_price: s.selling_price,
        duration_mins: s.duration_mins,
        is_active: s.is_active,
        description: s.description || '',
      };
    }

    // O(1) lookup for service relations & each HPP item! Total: O(S + R)
    const relations = db.relationsByServiceId.get(s.id) || [];
    const hppBreakdown = relations
      .map((r) => {
        const hppItem = db.hppById.get(r.hpp_id);
        if (!hppItem) return null;

        // Reflect current FIFO Head batch price if stock exists
        const batches = db.batchesByHppId.get(r.hpp_id) || [];
        const activeHeadBatch = batches.find((b) => b.quantity_remaining > 0);
        const effectiveCost = activeHeadBatch ? activeHeadBatch.unit_cost : hppItem.unit_cost || 0;

        return {
          hpp_id: r.hpp_id,
          item_name: hppItem.item_name,
          unit_cost: effectiveCost,
          unit_type: hppItem.unit_type || 'pcs',
          quantity_used: r.quantity_used,
          subtotal: Math.round(effectiveCost * r.quantity_used),
          fifo_batch_code: activeHeadBatch?.batch_code || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const totalHPP = hppBreakdown.reduce((acc, curr) => acc + curr.subtotal, 0);
    const profitMargin = s.selling_price - totalHPP;
    const profitPercent = s.selling_price > 0 ? Math.round((profitMargin / s.selling_price) * 100) : 0;

    return {
      ...s,
      total_hpp: Math.round(totalHPP),
      net_profit: Math.round(profitMargin),
      profit_percentage: profitPercent,
      hpp_breakdown: hppBreakdown,
    };
  });

  res.json(servicesResponse);
});

router.post('/services', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { service_name, selling_price, duration_mins = 18, is_active = true, description, hpp_items } = req.body;
  if (!service_name || typeof service_name !== 'string' || !service_name.trim() || selling_price === undefined) {
    return res.status(400).json({ error: 'Nama layanan dan harga jual wajib diisi.' });
  }

  const numPrice = Number(selling_price);
  if (isNaN(numPrice) || numPrice < 0) {
    return res.status(400).json({ error: 'Harga jual harus berupa angka valid.' });
  }

  const data = db.getData();
  const serviceId = `srv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newService: Service = {
    id: serviceId,
    service_name: service_name.trim(),
    selling_price: Math.round(numPrice),
    duration_mins: Math.max(1, Number(duration_mins) || 18),
    is_active: Boolean(is_active),
    description: typeof description === 'string' ? description.trim() : '',
  };

  data.services.push(newService);
  db.servicesById.set(serviceId, newService);

  const relationsForThisService: any[] = [];
  if (Array.isArray(hpp_items)) {
    for (const item of hpp_items) {
      if (item && item.hpp_id && item.quantity_used && db.hppById.has(item.hpp_id)) {
        const rel = {
          service_id: serviceId,
          hpp_id: item.hpp_id,
          quantity_used: Math.max(0.1, Number(item.quantity_used) || 1),
        };
        data.service_hpp_relations.push(rel);
        relationsForThisService.push({ hpp_id: rel.hpp_id, quantity_used: rel.quantity_used });
      }
    }
  }
  db.rebuildIndexes();

  await db.saveDataAsync();
  // CRITICAL FIX: Attach recipe array to Supabase payload so cloud persistence preserves HPP recipes!
  await syncServiceToSupabase({ ...newService, recipe: relationsForThisService });
  broadcastSSE('SERVICES_UPDATED', { action: 'CREATED', service: newService });

  res.status(201).json({ success: true, service: newService });
});

router.put('/services/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { service_name, selling_price, duration_mins, is_active, description, hpp_items } = req.body;
  const data = db.getData();
  const service = db.servicesById.get(id);

  if (!service) {
    return res.status(404).json({ error: 'Layanan tidak ditemukan' });
  }

  if (typeof service_name === 'string' && service_name.trim()) service.service_name = service_name.trim();
  if (selling_price !== undefined) {
    const num = Number(selling_price);
    if (!isNaN(num) && num >= 0) service.selling_price = Math.round(num);
  }
  if (duration_mins !== undefined) {
    const dur = Number(duration_mins);
    if (!isNaN(dur) && dur > 0) service.duration_mins = dur;
  }
  if (is_active !== undefined) service.is_active = Boolean(is_active);
  if (description !== undefined) service.description = String(description).trim();

  let relationsForSupabase: any[] = [];
  if (Array.isArray(hpp_items)) {
    data.service_hpp_relations = data.service_hpp_relations.filter((r) => r.service_id !== id);
    for (const item of hpp_items) {
      if (item && item.hpp_id && item.quantity_used && db.hppById.has(item.hpp_id)) {
        const rel = {
          service_id: id,
          hpp_id: item.hpp_id,
          quantity_used: Math.max(0.1, Number(item.quantity_used) || 1),
        };
        data.service_hpp_relations.push(rel);
        relationsForSupabase.push({ hpp_id: rel.hpp_id, quantity_used: rel.quantity_used });
      }
    }
    db.rebuildIndexes();
  } else {
    relationsForSupabase = (db.relationsByServiceId.get(id) || []).map((r) => ({
      hpp_id: r.hpp_id,
      quantity_used: r.quantity_used,
    }));
  }

  await db.saveDataAsync();
  // CRITICAL FIX: Always sync current recipe array to Supabase
  await syncServiceToSupabase({ ...service, recipe: relationsForSupabase });
  broadcastSSE('SERVICES_UPDATED', { action: 'UPDATED', service });

  res.json({ success: true, service });
});

router.delete('/services/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const target = db.servicesById.get(id);

  if (!target) {
    return res.status(404).json({ error: 'Layanan tidak ditemukan' });
  }

  data.services = data.services.filter((s) => s.id !== id);
  data.service_hpp_relations = data.service_hpp_relations.filter((r) => r.service_id !== id);
  db.rebuildIndexes();

  await db.saveDataAsync();
  await deleteServiceFromSupabase(id);
  broadcastSSE('SERVICES_UPDATED', { action: 'DELETED', id });

  res.json({ success: true, message: 'Layanan berhasil dihapus' });
});

// -------------------------------------------------------------
// 6. Direct POS Checkout & Transactions (O(limit) Reverse Tail Read)
// -------------------------------------------------------------

router.get('/transactions', requireRole('OWNER', 'STAFF'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  // Transactions are stored chronologically ASC so reverse slice reads latest-first in O(limit)
  const txs = data.transactions;
  const endIdx = Math.max(0, txs.length - offset);
  const startIdx = Math.max(0, endIdx - limit);
  const pagedTxs: Transaction[] = [];
  for (let i = endIdx - 1; i >= startIdx; i--) {
    pagedTxs.push(txs[i]);
  }

  res.json(pagedTxs);
});

router.post('/transactions/direct-checkout', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const { customer_name, service_id, custom_service_name, selling_price, discount = 0, tax = 0, payment_method = 'CASH' } =
    req.body;
  const data = db.getData();

  const service = service_id ? db.servicesById.get(service_id) : undefined;
  const serviceName = service
    ? service.service_name
    : typeof custom_service_name === 'string' && custom_service_name.trim()
    ? custom_service_name.trim()
    : 'Direct Haircut';

  const rawBase = service ? service.selling_price : Number(selling_price || 50000);
  const basePrice = isNaN(rawBase) || rawBase < 0 ? 50000 : Math.round(rawBase);

  const { totalHPP, fifoBatchesUsed, modifiedBatches } = service
    ? db.consumeServiceMaterialsFIFO(service.id)
    : { totalHPP: 0, fifoBatchesUsed: [], modifiedBatches: [] };

  const rawDisc = Number(discount);
  const numDiscount = isNaN(rawDisc) || rawDisc < 0 ? 0 : Math.round(rawDisc);

  const rawTax = Number(tax);
  const numTax = isNaN(rawTax) || rawTax < 0 ? 0 : Math.round(rawTax);

  const finalPrice = Math.max(0, basePrice - numDiscount + numTax);
  const netProfit = finalPrice - totalHPP;

  const validPaymentMethods = ['CASH', 'QRIS', 'DEBIT', 'TRANSFER'];
  const validMethod = validPaymentMethods.includes(payment_method) ? payment_method : 'CASH';

  const newTx: Transaction = {
    id: `trx-direct-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    queue_id: `q-direct-${Date.now()}`,
    customer_name: typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : 'Walk-In Kasir Langsung',
    service_name: serviceName,
    total_price: finalPrice,
    discount: numDiscount,
    tax: numTax,
    total_hpp: totalHPP,
    net_profit: netProfit,
    payment_method: validMethod,
    fifo_batches_used: fifoBatchesUsed,
    created_at: new Date().toISOString(),
  };

  data.transactions.push(newTx); // O(1) push
  db.txByQueueId.set(newTx.queue_id, newTx);

  db.traceBuffer.push({
    domain: 'HPP_BATCH_FIFO',
    operation: 'DIRECT_POS_FIFO_COGS',
    complexity: 'O(R + B_pop)',
    detail: `Direct POS (${serviceName}): HPP Rp ${totalHPP.toLocaleString('id-ID')}`,
    duration_us: 0,
  });

  await db.saveDataAsync();
  await syncTransactionToSupabase(newTx);
  for (const batch of modifiedBatches) {
    await syncHPPBatchToSupabase(batch);
  }
  broadcastSSE('TRANSACTION_CREATED', newTx);

  res.status(201).json({ success: true, transaction: newTx });
});

// -------------------------------------------------------------
// 7. Single-Pass O(T) Analytics & Big-O / FIFO Telemetry (Owner Only)
// -------------------------------------------------------------

router.get('/analytics/recap', requireRole('OWNER'), (_req: AuthenticatedRequest, res: Response) => {
  const t0 = performance.now();
  const data = db.getData();
  const result = aggregateAnalyticsSinglePass(data.transactions, new Date(), getJakartaDateStr);
  const elapsedUs = Math.round((performance.now() - t0) * 1000);

  db.traceBuffer.push({
    domain: 'ANALYTICS',
    operation: 'SINGLE_PASS_RECAP',
    complexity: 'O(T)',
    detail: `Agregasi ${data.transactions.length} transaksi (Daily + 7-Day + Monthly + Service Rank) dalam 1 pass`,
    duration_us: elapsedUs,
  });

  res.json(result);
});

// GET /api/system/complexity-metrics: Diagnostic Engine Telemetry for Project Praktek
router.get('/system/complexity-metrics', requireRole('OWNER'), (_req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const waitingSnapshot = db.waitingFIFO.toArray();
  const headItem = db.waitingFIFO.peek();
  const tailItem = db.waitingFIFO.peekTail();

  // Summarize FIFO Batch Queues per HPP item
  const hppFifoSummary = (data.master_hpp || []).map((h) => {
    const batches = db.batchesByHppId.get(h.id) || [];
    let totalRemaining = 0;
    let activeBatches = 0;
    let headBatch: HPPStockBatch | null = null;
    for (const b of batches) {
      if (b.quantity_remaining > 0) {
        totalRemaining += b.quantity_remaining;
        activeBatches += 1;
        if (!headBatch) headBatch = b;
      }
    }
    return {
      hpp_id: h.id,
      item_name: h.item_name,
      unit_type: h.unit_type,
      standard_unit_cost: h.unit_cost,
      total_remaining: Number(totalRemaining.toFixed(2)),
      active_batches_count: activeBatches,
      fifo_head_batch: headBatch
        ? {
            batch_code: headBatch.batch_code,
            quantity_remaining: headBatch.quantity_remaining,
            unit_cost: headBatch.unit_cost,
            received_at: headBatch.received_at,
          }
        : null,
      batches: batches.map((b, idx) => ({
        ...b,
        is_fifo_head: Boolean(headBatch && headBatch.id === b.id),
        fifo_order: idx + 1,
      })),
    };
  });

  // Micro-benchmark O(1) hash lookup vs theoretical naive scan
  const benchStart = performance.now();
  if (headItem) {
    db.waitingFIFO.get(headItem.id);
    db.queuesById.get(headItem.id);
  }
  db.usersById.get('usr-admin');
  const hashLookupNs = Math.max(1, Math.round((performance.now() - benchStart) * 1_000_000));

  res.json({
    engine: 'Arez Indexed FIFO + HashMap Engine v2.0',
    dataset_sizes: {
      users: data.users.length,
      services: data.services.length,
      master_hpp: data.master_hpp.length,
      hpp_batches: data.hpp_batches.length,
      queues_total: data.queues.length,
      waiting_fifo_active: waitingSnapshot.length,
      transactions: data.transactions.length,
      revoked_tokens_set: db.revokedTokensSet.size,
    },
    fifo_queue_state: {
      policy: 'HYBRID_STRICT_FIFO',
      size: waitingSnapshot.length,
      head: headItem
        ? {
            id: headItem.id,
            queue_number: headItem.queue_number,
            customer_name: headItem.customer_name || headItem.walk_in_name || 'Pelanggan',
            service_name: headItem.service_name,
            created_at: headItem.created_at,
          }
        : null,
      tail: tailItem
        ? {
            id: tailItem.id,
            queue_number: tailItem.queue_number,
            customer_name: tailItem.customer_name || tailItem.walk_in_name || 'Pelanggan',
            service_name: tailItem.service_name,
            created_at: tailItem.created_at,
          }
        : null,
      nodes: waitingSnapshot.map((q, idx) => ({
        id: q.id,
        fifo_rank: idx + 1,
        queue_number: q.queue_number,
        customer_name: q.customer_name || q.walk_in_name || 'Pelanggan',
        service_name: q.service_name,
        source: q.source,
        is_head: idx === 0,
        is_tail: idx === waitingSnapshot.length - 1,
      })),
    },
    hpp_fifo_batches: hppFifoSummary,
    complexity_matrix: [
      {
        module: 'Antrean FIFO Enqueue / Dequeue / Skip',
        data_structure: 'Doubly-Linked List + HashMap Index (IndexedFIFOQueue)',
        before_complexity: 'O(N) (Array.find + Array.splice / unshift)',
        after_complexity: 'O(1)',
        benefit: 'Waktu konstan untuk tambah tamu, panggil Head, atau batalkan antrean di tengah.',
      },
      {
        module: 'Auth Session & User/Token Validation',
        data_structure: 'HashMap (usersById) + HashSet (revokedTokensSet)',
        before_complexity: 'O(U + K) setiap HTTP request',
        after_complexity: 'O(1)',
        benefit: 'Verifikasi JWT & blacklist token konstan meski user & log bertambah ribuan.',
      },
      {
        module: 'Katalog Layanan + Resep HPP Join',
        data_structure: 'Adjacency Map (relationsByServiceId) + hppById Map',
        before_complexity: 'O(S * R * H) nested linear filter & find',
        after_complexity: 'O(S + R)',
        benefit: 'Menghilangkan nested quadratic scan antar tabel layanan, resep, dan bahan baku.',
      },
      {
        module: 'FIFO HPP Stock Batch Deduction',
        data_structure: 'Chronological Batch Queue (received_at ASC)',
        before_complexity: 'Static avg/master cost tanpa lot FIFO',
        after_complexity: 'O(1) amortized per batch',
        benefit: 'Batch terlama otomatis terpotong lebih dulu; HPP & Laba Bersih akurat riil.',
      },
      {
        module: 'Agregasi Laporan Finansial (Daily/Weekly/Monthly)',
        data_structure: 'Single-Pass Hash Bucket Map',
        before_complexity: 'O(10 * T) 9x filter & reduce terpisah',
        after_complexity: 'O(T)',
        benefit: 'Menghitung seluruh KPI harian, grafik 7 hari, dan ranking bulanan dalam 1 kali iterasi.',
      },
      {
        module: 'Audit Log & Ring Telemetry',
        data_structure: 'Fixed-Capacity Circular Ring Buffer',
        before_complexity: 'O(N) Array.unshift()',
        after_complexity: 'O(1) waktu & O(1) ruang',
        benefit: 'Mencegah pergeseran memori dan memory leak pada log aktivitas real-time.',
      },
    ],
    measured_lookup_ns: hashLookupNs,
    recent_traces: db.traceBuffer.getLatest(30),
  });
});

// -------------------------------------------------------------
// 8. CRM & Retention Management (Owner Only)
// -------------------------------------------------------------

router.get('/crm/behavior', requireRole('OWNER'), (_req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const customers = data.users.filter((u) => u.role === 'CUSTOMER');
  const now = Date.now();
  let retentionAlertsCount = 0;

  const enrichedCustomers = customers.map((c) => {
    let daysSinceLastVisit = 0;
    if (c.last_visit_at) {
      daysSinceLastVisit = Math.floor((now - new Date(c.last_visit_at).getTime()) / (1000 * 60 * 60 * 24));
    }
    const needsRetentionReminder = daysSinceLastVisit >= 30;
    if (needsRetentionReminder) retentionAlertsCount += 1;

    return {
      ...sanitizeUser(c),
      days_since_last_visit: daysSinceLastVisit,
      needs_retention_reminder: needsRetentionReminder,
    };
  });

  res.json({
    customers: enrichedCustomers,
    total_customers: customers.length,
    retention_alerts_count: retentionAlertsCount,
  });
});

router.post('/crm/send-retention-push', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { user_id, message } = req.body;
  const data = db.getData();
  const user = db.usersById.get(user_id); // O(1)

  if (!user) {
    return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
  }

  const notif: NotificationLog = {
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    user_id: user.id,
    title: 'Waktunya Merapikan Rambut Anda — Arez Barbershop',
    message:
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Sudah lebih dari 30 hari sejak potongan terakhir Anda. Booking antrean sekarang untuk menjaga penampilan selalu tajam dan rapi.',
    type: 'RETENTION_30D',
    created_at: new Date().toISOString(),
    read: false,
  };

  data.notifications.push(notif); // O(1) push
  await db.saveDataAsync();
  await syncNotificationToSupabase(notif);
  broadcastSSE('NOTIFICATION_SENT', { user: sanitizeUser(user), notification: notif });

  res.json({ success: true, notification: notif });
});

router.get('/notifications/:user_id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { user_id } = req.params;

  if (!isOwnerRole(req.user!.role) && req.user!.id !== user_id) {
    return res.status(403).json({
      error: 'Akses ditolak: Anda hanya dapat mengakses notifikasi akun Anda sendiri.',
      code: 'FORBIDDEN_IDOR',
    });
  }

  const data = db.getData();
  // Return newest first
  const userNotifs: NotificationLog[] = [];
  for (let i = data.notifications.length - 1; i >= 0; i--) {
    if (data.notifications[i].user_id === user_id) {
      userNotifs.push(data.notifications[i]);
    }
  }
  res.json(userNotifs);
});

export default router;
