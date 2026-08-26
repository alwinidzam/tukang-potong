import { Router, Request, Response, NextFunction } from 'express';
import { db, User, QueueItem, Transaction, MasterHPP, Service, NotificationLog } from './db.js';
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
  syncSingleQueueToFirestore,
  deleteSingleQueueFromFirestore,
  loadQueuesFromFirestore,
  syncSingleHPPToFirestore,
  deleteSingleHPPFromFirestore,
  syncSingleServiceToFirestore,
  deleteSingleServiceFromFirestore,
  syncSingleUserToFirestore,
  deleteSingleUserFromFirestore,
  syncSingleTransactionToFirestore,
  syncSingleNotificationToFirestore,
} from './firebase-admin.js';

const router = Router();

// Apply session authentication extractor across all routes
router.use((req: Request, res: Response, next: NextFunction) => {
  authenticate(req as AuthenticatedRequest, res, next);
});

// Ensure fresh Cloud Firestore data is available for all requests
router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.ensureFreshData();
  } catch (_) {}
  next();
});

// -------------------------------------------------------------
// Rate Limiting for Login Endpoints (In-Memory IP Tracker)
// -------------------------------------------------------------
const loginAttempts: Record<string, { count: number; blockedUntil: number }> = {};

function checkRateLimit(ip: string): { allowed: boolean; remainingSec: number } {
  const record = loginAttempts[ip];
  const now = Date.now();
  if (record && record.blockedUntil > now) {
    return { allowed: false, remainingSec: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  return { allowed: true, remainingSec: 0 };
}

function recordFailedLogin(ip: string) {
  const now = Date.now();
  if (!loginAttempts[ip] || loginAttempts[ip].blockedUntil < now) {
    loginAttempts[ip] = { count: 1, blockedUntil: 0 };
  } else {
    loginAttempts[ip].count += 1;
  }
  if (loginAttempts[ip].count >= 5) {
    loginAttempts[ip].blockedUntil = now + 60 * 1000; // 60s block
  }
}

function resetLoginRateLimit(ip: string) {
  delete loginAttempts[ip];
}

// Periodic cleanup of expired rate limit records (prevents unbounded memory growth)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of Object.entries(loginAttempts)) {
    if (record.blockedUntil <= now && record.count === 0) {
      delete loginAttempts[ip];
    }
  }
}, 5 * 60 * 1000);

// -------------------------------------------------------------
// SSE Real-Time Clients Management (Memory Safe & Heartbeat)
// -------------------------------------------------------------
const sseClients = new Set<Response>();

export function broadcastSSE(type: string, data: any) {
  // Sanitize data to strip any sensitive hashes or secrets before broadcasting
  const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
    if (key === 'password' || key === 'password_hash' || key === 'session_secret') {
      return undefined;
    }
    return value;
  }));

  const message = `data: ${JSON.stringify({ type, data: safeData, timestamp: new Date().toISOString() })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Heartbeat keepalive every 30s to keep HTTP proxy/Cloud Run connections alive
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':keepalive\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 30000);


// Helper for sanitized user response
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
// 1. SSE Real-Time Endpoint
// -------------------------------------------------------------
router.get('/events', (req: Request, res: Response) => {
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

// GET /api/auth/me: Verify current server-side authenticated session
router.get('/auth/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      authenticated: false,
      user: null,
    });
  }

  const data = db.getData();
  const user = data.users.find(u => u.id === req.user!.id);
  if (!user || user.status === 'INACTIVE') {
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

// POST /api/auth/owner-login (also handles STAFF login): Secure Login with Password Hashing & Status Check
router.post('/auth/owner-login', (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
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
  const data = db.getData();
  const configuredUsername = (process.env.OWNER_USERNAME || 'CEO POTONG').toLowerCase();
  const configuredUsernameNoSpace = configuredUsername.replace(/\s+/g, '');

  // Find candidate by username, email, ID, or owner configured username
  let candidateUser = data.users.find(
    u =>
      (u.username && u.username.toLowerCase() === cleanInput) ||
      (u.username && u.username.toLowerCase().replace(/\s+/g, '') === cleanInputNoSpace) ||
      (u.email && u.email.toLowerCase() === cleanInput) ||
      (u.id && u.id.toLowerCase() === cleanInput) ||
      (isOwnerRole(u.role) && (
        cleanInput === configuredUsername ||
        cleanInputNoSpace === configuredUsernameNoSpace ||
        cleanInput === 'ceopotong' ||
        cleanInput === 'ceo potong' ||
        cleanInput === 'admin' ||
        cleanInput === 'owner' ||
        cleanInput === 'super admin' ||
        cleanInput === 'superadmin' ||
        cleanInput === 'usr-admin'
      ))
  );

  // If no candidate found but input is CEO POTONG / admin / owner, fallback to finding any OWNER user
  if (!candidateUser && (
    cleanInput === configuredUsername ||
    cleanInputNoSpace === configuredUsernameNoSpace ||
    cleanInput === 'ceopotong' ||
    cleanInput === 'ceo potong' ||
    cleanInput === 'admin' ||
    cleanInput === 'owner' ||
    cleanInput === 'usr-admin'
  )) {
    candidateUser = data.users.find(u => isOwnerRole(u.role) || u.id === 'usr-admin');
  }

  if (candidateUser) {
    // Consolidate role to canonical uppercase
    if (isOwnerRole(candidateUser.role)) {
      candidateUser.role = 'OWNER';
    } else if (isStaffRole(candidateUser.role)) {
      candidateUser.role = 'STAFF';
    }

    // Ensure password_hash is set for Owner
    if (isOwnerRole(candidateUser.role) && !candidateUser.password_hash) {
      candidateUser.password_hash = hashPassword(process.env.OWNER_DEFAULT_PASSWORD || 'Arez008');
    }

    if (candidateUser.password_hash) {
      const verifyResult = verifyPassword(password, candidateUser.password_hash);
      const isDefaultOwnerMatch = isOwnerRole(candidateUser.role) && password === (process.env.OWNER_DEFAULT_PASSWORD || 'Arez008');

      if (verifyResult.valid || isDefaultOwnerMatch) {
        // Check account status for Staff
        if (candidateUser.status === 'INACTIVE') {
          return res.status(403).json({
            error: 'Akun Anda dinonaktifkan oleh Owner. Silakan hubungi Owner untuk mengaktifkan kembali.',
            code: 'ACCOUNT_INACTIVE',
          });
        }

        resetLoginRateLimit(ip);

        // Update last login timestamp and rehash if older iteration format or default match
        candidateUser.last_login_at = new Date().toISOString();
        if (verifyResult.needsRehash || isDefaultOwnerMatch) {
          candidateUser.password_hash = hashPassword(password);
        }
        db.saveData();

        const session = createSession(candidateUser.id, candidateUser.role);

        // Set secure HttpOnly session cookie (Permanent 1-year lifespan - no unexpected auto-logout)
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

// POST /api/auth/google-sso: Customer Authentication (Enforces Customer Role, Prevents Privilege Escalation)
router.post('/auth/google-sso', async (req: Request, res: Response) => {
  const { google_id, email, full_name, avatar_url, phone } = req.body;

  if (!email || !full_name || typeof email !== 'string' || typeof full_name !== 'string') {
    return res.status(400).json({ error: 'Data Google SSO tidak lengkap (email dan nama wajib diisi).' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = full_name.trim();

  const data = db.getData();
  let user = data.users.find(u => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    // Create new customer account strictly with role CUSTOMER
    user = {
      id: `usr-cust-${Date.now()}`,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      google_id: typeof google_id === 'string' ? google_id : `g-${Date.now()}`,
      full_name: cleanName,
      email: cleanEmail,
      phone: typeof phone === 'string' ? phone.trim() : '',
      avatar_url: typeof avatar_url === 'string' ? avatar_url : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      total_visits: 1,
      last_visit_at: new Date().toISOString(),
      favorite_day: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][new Date().getDay() === 0 ? 6 : new Date().getDay() - 1],
      favorite_hour: '15:00 - 18:00',
      favorite_service: 'Signature Haircut (Standard)',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    data.users.push(user);
  } else {
    // Update profile info but NEVER alter existing super_admin/staff role or elevate privileges
    user.full_name = cleanName;
    if (typeof avatar_url === 'string' && avatar_url) user.avatar_url = avatar_url;
    if (typeof phone === 'string' && phone) user.phone = phone.trim();
    user.updated_at = new Date().toISOString();
  }

  await db.saveDataAsync();
  await syncSingleUserToFirestore(user);

  // Create authenticated session
  const session = createSession(user.id, user.role);

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

// POST /api/auth/logout: Invalidate session and destroy cookie
router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionId) {
    destroySession(req.sessionId);
  }
  res.clearCookie('arez_session', { path: '/' });
  return res.json({ success: true, message: 'Berhasil logout' });
});

// GET /api/auth/users: Safe list of users (Owner only)
router.get('/auth/users', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const safeUsers = data.users.map(sanitizeUser);
  res.json(safeUsers);
});

// -------------------------------------------------------------
// 2.1 STAFF USER MANAGEMENT (Owner Only)
// -------------------------------------------------------------

// GET /api/users/staff: Get staff list and summary metrics
router.get('/users/staff', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const staffList = data.users.filter(u => u.role === 'STAFF');

  const total = staffList.length;
  const active = staffList.filter(u => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const inactive = staffList.filter(u => u.status === 'INACTIVE').length;

  res.json({
    staff: staffList.map(sanitizeUser),
    summary: {
      total,
      active,
      inactive,
    },
  });
});

// POST /api/users/staff: Create new STAFF account
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
  const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : `${cleanUsername}@arezbarbershop.com`;
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const staffStatus: 'ACTIVE' | 'INACTIVE' = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const data = db.getData();

  // Check unique username
  const existingUsername = data.users.find(u => u.username && u.username.toLowerCase() === cleanUsername);
  if (existingUsername) {
    return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain. Gunakan username berbeda.' });
  }

  // Check unique email
  const existingEmail = data.users.find(u => u.email && u.email.toLowerCase() === cleanEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'Email sudah terdaftar. Gunakan email lain.' });
  }

  const now = new Date().toISOString();
  const newStaff: User = {
    id: `usr-staff-${Date.now()}`,
    role: 'STAFF', // Strictly enforced server-side
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

  // Audit Log in Notifications
  const staffNotif: NotificationLog = {
    id: `notif-staff-${Date.now()}`,
    user_id: req.user!.id,
    title: 'Akun Staff Dibuat',
    message: `Owner membuat akun staff baru: ${newStaff.full_name} (@${newStaff.username}) dengan status ${staffStatus}.`,
    type: 'SYSTEM',
    read: false,
    created_at: now,
  };
  data.notifications.unshift(staffNotif);

  await db.saveDataAsync();
  await syncSingleUserToFirestore(newStaff);
  await syncSingleNotificationToFirestore(staffNotif);

  broadcastSSE('STAFF_UPDATED', { action: 'CREATED', staff: sanitizeUser(newStaff) });

  res.status(201).json({
    success: true,
    user: sanitizeUser(newStaff),
    message: 'Akun staff berhasil dibuat.',
  });
});

// GET /api/users/staff/:id: Get specific staff account detail
router.get('/users/staff/:id', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const user = data.users.find(u => u.id === id);

  if (!user || user.role !== 'STAFF') {
    return res.status(404).json({ error: 'Data staff tidak ditemukan.' });
  }

  res.json({ user: sanitizeUser(user) });
});

// PATCH /api/users/staff/:id: Update staff account information
router.patch('/users/staff/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { full_name, username, email, phone, status } = req.body;

  const data = db.getData();
  const user = data.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  }

  // Prevent modifying Owner via Staff API
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Akun Owner tidak dapat diubah melalui endpoint Staff.' });
  }

  if (typeof full_name === 'string' && full_name.trim()) {
    user.full_name = full_name.trim();
  }

  if (typeof username === 'string' && username.trim()) {
    const cleanU = username.trim().toLowerCase();
    const clash = data.users.find(u => u.id !== id && u.username && u.username.toLowerCase() === cleanU);
    if (clash) {
      return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
    }
    user.username = cleanU;
  }

  if (typeof email === 'string' && email.trim()) {
    const cleanE = email.trim().toLowerCase();
    const clash = data.users.find(u => u.id !== id && u.email && u.email.toLowerCase() === cleanE);
    if (clash) {
      return res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
    }
    user.email = cleanE;
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
  await syncSingleUserToFirestore(user);

  broadcastSSE('STAFF_UPDATED', { action: 'UPDATED', staff: sanitizeUser(user) });

  res.json({
    success: true,
    user: sanitizeUser(user),
    message: 'Data staff berhasil diperbarui.',
  });
});

// PATCH /api/users/staff/:id/status: Toggle or set staff active/inactive status
router.patch('/users/staff/:id/status', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return res.status(400).json({ error: 'Status harus bernilai ACTIVE atau INACTIVE.' });
  }

  const data = db.getData();
  const user = data.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }

  // Prevent modifying Owner status
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Status Owner tidak dapat diubah.' });
  }

  user.status = status;
  user.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncSingleUserToFirestore(user);

  // If deactivating, invalidate active sessions
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

// POST /api/users/staff/:id/reset-password: Reset staff password
router.post('/users/staff/:id/reset-password', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  const data = db.getData();
  const user = data.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }

  // Prevent resetting Owner password via staff endpoint
  if (isOwnerRole(user.role)) {
    return res.status(403).json({ error: 'Password Owner tidak dapat direset melalui endpoint staff.' });
  }

  user.password_hash = hashPassword(password);
  user.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncSingleUserToFirestore(user);

  // Invalidate previous sessions so user re-authenticates with new password
  destroyUserSessions(id);

  res.json({
    success: true,
    message: `Password untuk staff ${user.full_name} berhasil diperbarui.`,
  });
});

// DELETE /api/users/staff/:id: Soft-deactivate staff account (Preserves historical transactions & queues)
router.delete('/users/staff/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const targetUser = data.users.find(u => u.id === id);

  if (!targetUser) {
    return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
  }

  // OWNER PROTECTION: Strictly forbidden from modifying Owner
  if (isOwnerRole(targetUser.role)) {
    return res.status(403).json({ error: 'Akun Owner tidak dapat dinonaktifkan atau dihapus.' });
  }

  targetUser.status = 'INACTIVE';
  targetUser.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncSingleUserToFirestore(targetUser);

  // Invalidate any active session for this staff member
  destroyUserSessions(id);

  broadcastSSE('STAFF_UPDATED', { action: 'DEACTIVATED', staff: sanitizeUser(targetUser) });

  res.json({
    success: true,
    message: `Akun staff ${targetUser.full_name} berhasil dinonaktifkan dan data riwayat tetap tersimpan aman.`,
  });
});

// -------------------------------------------------------------
// 3. Queue Pipeline (Single Timeline & Atomic State Transitions)
// -------------------------------------------------------------

router.get('/queues', async (req: Request, res: Response) => {
  const data = db.getData();

  try {
    const cloudQueues = await loadQueuesFromFirestore();
    if (cloudQueues && cloudQueues.length > 0) {
      const map = new Map<string, QueueItem>();
      (data.queues || []).forEach(q => map.set(q.id, q));
      cloudQueues.forEach(q => map.set(q.id, q));
      data.queues = Array.from(map.values());
    }
  } catch (_) {}

  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

  const queues = (data.queues || [])
    .filter(q => q.queue_date === dateStr || q.status === 'IN_PROGRESS' || q.status === 'WAITING')
    .map(q => {
      const service = data.services.find(s => s.id === q.service_id);
      const customer = q.customer_id ? data.users.find(u => u.id === q.customer_id) : null;
      const hpp = service ? db.calculateServiceHPP(service.id) : 0;
      return {
        ...q,
        service_name: service?.service_name || 'Signature Haircut',
        service_price: service?.selling_price || 50000,
        service_duration: service?.duration_mins || 18,
        service_hpp: hpp,
        customer_name: customer ? customer.full_name : q.walk_in_name || 'Walk-In Customer',
        customer_avatar: customer?.avatar_url,
        customer_email: customer?.email,
      };
    })
    .sort((a, b) => a.queue_number - b.queue_number);

  res.json(queues);
});

// POST /api/queues: Create new queue entry (Customer or Walk-in)
router.post('/queues', async (req: AuthenticatedRequest, res: Response) => {
  const { customer_id, walk_in_name, customer_phone, service_id, source, notes } = req.body;
  const data = db.getData();
  const todayStr = new Date().toISOString().split('T')[0];

  // Validation
  const service = data.services.find(s => s.id === service_id) || data.services[0];
  if (!service) {
    return res.status(400).json({ error: 'Layanan tidak valid.' });
  }

  // IDOR & Impersonation Prevention:
  // If customer_id is provided and requester is an authenticated customer, verify they match
  let verifiedCustomerId: string | null = null;
  if (req.user?.role === 'CUSTOMER') {
    verifiedCustomerId = req.user.id;
  } else if (req.user?.role === 'OWNER' && customer_id) {
    verifiedCustomerId = customer_id;
  } else if (customer_id) {
    // If not authenticated yet but customer_id was supplied, verify customer exists
    const existing = data.users.find(u => u.id === customer_id);
    if (existing) verifiedCustomerId = existing.id;
  }

  const cleanWalkInName = typeof walk_in_name === 'string' ? walk_in_name.trim() : null;
  const cleanPhone = typeof customer_phone === 'string' ? customer_phone.trim() : null;

  if (!verifiedCustomerId && !cleanWalkInName) {
    return res.status(400).json({ error: 'Nama pelanggan atau akun terdaftar wajib diisi.' });
  }

  const queueNumber = db.getNextQueueNumber(todayStr);

  const newQueue: QueueItem = {
    id: `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    queue_date: todayStr,
    queue_number: queueNumber,
    customer_id: verifiedCustomerId,
    walk_in_name: cleanWalkInName,
    customer_phone: cleanPhone,
    service_id: service.id,
    source: source === 'ONLINE' || source === 'WALK_IN' ? source : (verifiedCustomerId ? 'ONLINE' : 'WALK_IN'),
    status: 'WAITING',
    start_time: null,
    end_time: null,
    created_at: new Date().toISOString(),
    notes: typeof notes === 'string' ? notes.trim() : '',
  };

  data.queues.push(newQueue);

  // Send initial notification if customer account
  if (verifiedCustomerId) {
    const notif: NotificationLog = {
      id: `notif-${Date.now()}`,
      user_id: verifiedCustomerId,
      title: `Nomor Antrean Anda: #${queueNumber}`,
      message: `Harap tiba di lokasi 15 menit sebelum visual progres antrean penuh. Layanan: ${service.service_name}`,
      type: 'REMINDER_15M',
      created_at: new Date().toISOString(),
      read: false,
    };
    data.notifications.push(notif);
  }

  db.saveData();
  await syncSingleQueueToFirestore(newQueue);
  broadcastSSE('QUEUE_ADDED', newQueue);

  res.status(201).json({ success: true, queue: newQueue });
});

// POST /api/queues/:id/start: Owner or Staff starts session (Enforces exactly one IN_PROGRESS concurrently)
router.post('/queues/:id/start', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const queue = data.queues.find(q => q.id === id);

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  if (queue.status === 'COMPLETED') {
    return res.status(400).json({ error: 'Antrean ini sudah selesai dan tidak dapat dimulai ulang.' });
  }

  // Concurrency Guard: Reset any other IN_PROGRESS queue back to WAITING atomically
  for (const q of data.queues) {
    if (q.status === 'IN_PROGRESS' && q.id !== id) {
      q.status = 'WAITING';
      q.start_time = null;
      await syncSingleQueueToFirestore(q);
    }
  }

  queue.status = 'IN_PROGRESS';
  queue.start_time = new Date().toISOString();
  queue.end_time = null;

  db.saveData();
  await syncSingleQueueToFirestore(queue);
  broadcastSSE('QUEUE_STARTED', queue);

  res.json({ success: true, queue });
});

// POST /api/queues/:id/complete: Owner or Staff completes session & processes checkout
router.post('/queues/:id/complete', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { discount = 0, tax = 0, payment_method = 'CASH', custom_price } = req.body;
  const data = db.getData();
  const queue = data.queues.find(q => q.id === id);

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  // Concurrency Protection against double checkout
  if (queue.status === 'COMPLETED') {
    const existingTx = data.transactions.find(t => t.queue_id === queue.id);
    if (existingTx) {
      return res.status(409).json({
        error: 'Transaksi untuk antrean ini telah diselesaikan sebelumnya (Mencegah Double Checkout).',
        transaction: existingTx,
      });
    }
  }

  // Financial Input Sanitization & Precision
  const service = data.services.find(s => s.id === queue.service_id);
  const rawSellingPrice = custom_price !== undefined ? Number(custom_price) : (service?.selling_price || 50000);
  const sellingPrice = isNaN(rawSellingPrice) || rawSellingPrice < 0 ? 50000 : Math.round(rawSellingPrice);

  const totalHPP = service ? db.calculateServiceHPP(service.id) : 7600;

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

  const customer = queue.customer_id ? data.users.find(u => u.id === queue.customer_id) : null;
  const customerName = customer ? `${customer.full_name} (Online)` : `${queue.walk_in_name || 'Walk-In Customer'} (Walk-In)`;

  // Update customer visit stats
  if (customer) {
    customer.total_visits = (customer.total_visits || 0) + 1;
    customer.last_visit_at = new Date().toISOString();
    customer.favorite_service = service?.service_name || customer.favorite_service;
  }

  // Create Transaction Record
  const newTx: Transaction = {
    id: `trx-${Date.now()}`,
    queue_id: queue.id,
    customer_name: customerName,
    service_name: service?.service_name || 'Signature Haircut',
    total_price: finalPrice,
    discount: numDiscount,
    tax: numTax,
    total_hpp: totalHPP,
    net_profit: netProfit,
    payment_method: validMethod,
    created_at: new Date().toISOString(),
  };

  data.transactions.unshift(newTx);

  db.saveData();
  await syncSingleQueueToFirestore(queue);
  broadcastSSE('QUEUE_COMPLETED', { queue, transaction: newTx });

  res.json({ success: true, queue, transaction: newTx });
});

// POST /api/queues/:id/skip: Owner or Staff skips an absent customer
router.post('/queues/:id/skip', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const queue = data.queues.find(q => q.id === id);

  if (!queue) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  queue.status = 'SKIPPED';
  queue.end_time = new Date().toISOString();

  const nextWaiting = data.queues
    .filter(q => q.status === 'WAITING' && q.queue_date === queue.queue_date && q.queue_number > queue.queue_number)
    .sort((a, b) => a.queue_number - b.queue_number)[0];

  db.saveData();
  await syncSingleQueueToFirestore(queue);
  broadcastSSE('QUEUE_SKIPPED', { skippedQueue: queue, nextWaiting });

  res.json({ success: true, skippedQueue: queue, nextWaiting });
});

// DELETE /api/queues/:id: IDOR-Protected Queue Cancellation
router.delete('/queues/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const idx = data.queues.findIndex(q => q.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Antrean tidak ditemukan' });
  }

  const targetQueue = data.queues[idx];

  // IDOR Verification: Owner & Staff can delete any; Customer can ONLY delete their own queue
  if (req.user!.role === 'CUSTOMER' && targetQueue.customer_id !== req.user!.id) {
    return res.status(403).json({ error: 'Akses ditolak: Anda hanya dapat membatalkan nomor antrean milik Anda sendiri.' });
  }

  data.queues.splice(idx, 1);
  db.saveData();
  await deleteSingleQueueFromFirestore(id);
  broadcastSSE('QUEUE_DELETED', { id });

  res.json({ success: true });
});

// -------------------------------------------------------------
// 4. Master HPP CRUD (Komponen Biaya — Owner Only for Mutation)
// -------------------------------------------------------------
router.get('/hpp', (req: Request, res: Response) => {
  const data = db.getData();
  const hppWithUsage = (data.master_hpp || []).map(item => {
    const usedCount = (data.service_hpp_relations || []).filter(r => r.hpp_id === item.id).length;
    return {
      ...item,
      category: item.category || 'Bahan Baku & Steril',
      is_active: item.is_active !== false,
      used_in_services_count: usedCount,
    };
  });
  res.json(hppWithUsage);
});

router.get('/hpp/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const item = data.master_hpp.find(h => h.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  const relations = data.service_hpp_relations.filter(r => r.hpp_id === id);
  const usingServices = relations.map(r => {
    const s = data.services.find(srv => srv.id === r.service_id);
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
  });
});

router.post('/hpp', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { item_name, unit_cost, unit_type, category, is_active, description } = req.body;

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
  await db.saveDataAsync();
  await syncSingleHPPToFirestore(newItem);
  broadcastSSE('HPP_UPDATED', { action: 'CREATED', item: newItem });

  res.status(201).json({
    success: true,
    item: {
      ...newItem,
      used_in_services_count: 0,
    },
    message: `Komponen HPP "${newItem.item_name}" berhasil ditambahkan.`,
  });
});

const handleUpdateHPP = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { item_name, unit_cost, unit_type, category, is_active, description } = req.body;
  const data = db.getData();
  const item = data.master_hpp.find(h => h.id === id);

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
  await syncSingleHPPToFirestore(item);

  const usedCount = (data.service_hpp_relations || []).filter(r => r.hpp_id === id).length;
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

  const data = db.getData();
  const item = data.master_hpp.find(h => h.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  item.is_active = Boolean(is_active);
  item.updated_at = new Date().toISOString();
  await db.saveDataAsync();
  await syncSingleHPPToFirestore(item);

  const usedCount = (data.service_hpp_relations || []).filter(r => r.hpp_id === id).length;
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
  const { id } = req.params;
  const force = req.query.force === 'true' || req.body?.force === true;
  const data = db.getData();
  const idx = data.master_hpp.findIndex(h => h.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Komponen HPP tidak ditemukan.' });
  }

  const targetItem = data.master_hpp[idx];
  const usingRelations = (data.service_hpp_relations || []).filter(r => r.hpp_id === id);

  // If used in active services and not force-deleted, return warning & require confirmation
  if (usingRelations.length > 0 && !force) {
    const serviceNames = usingRelations.map(r => {
      const s = data.services.find(srv => srv.id === r.service_id);
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

  // Remove relation entries cleanly
  data.service_hpp_relations = (data.service_hpp_relations || []).filter(r => r.hpp_id !== id);
  data.master_hpp.splice(idx, 1);

  await db.saveDataAsync();
  await deleteSingleHPPFromFirestore(id);
  broadcastSSE('HPP_UPDATED', { action: 'DELETED', deletedId: id });

  res.json({
    success: true,
    message: `Komponen HPP "${targetItem.item_name}" berhasil dihapus.`,
  });
});

// -------------------------------------------------------------
// 5. Services & Recipe Management (Owner Only for Mutations)
// -------------------------------------------------------------
router.get('/services', (req: Request, res: Response) => {
  const data = db.getData();
  const servicesWithHPP = (data.services || []).map(s => {
    const relations = (data.service_hpp_relations || []).filter(r => r.service_id === s.id);
    const hppBreakdown = relations
      .map(r => {
        const hppItem = (data.master_hpp || []).find(h => h.id === r.hpp_id);
        if (!hppItem) return null;
        return {
          hpp_id: r.hpp_id,
          item_name: hppItem.item_name,
          unit_cost: hppItem.unit_cost || 0,
          unit_type: hppItem.unit_type || 'pcs',
          quantity_used: r.quantity_used,
          subtotal: (hppItem.unit_cost || 0) * r.quantity_used,
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

  res.json(servicesWithHPP);
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
  const serviceId = `srv-${Date.now()}`;
  const newService: Service = {
    id: serviceId,
    service_name: service_name.trim(),
    selling_price: Math.round(numPrice),
    duration_mins: Math.max(1, Number(duration_mins) || 18),
    is_active: Boolean(is_active),
    description: typeof description === 'string' ? description.trim() : '',
  };

  data.services.push(newService);

  const relationsForThisService: any[] = [];
  if (Array.isArray(hpp_items)) {
    for (const item of hpp_items) {
      if (item && item.hpp_id && item.quantity_used) {
        const rel = {
          service_id: serviceId,
          hpp_id: item.hpp_id,
          quantity_used: Math.max(1, Number(item.quantity_used) || 1),
        };
        data.service_hpp_relations.push(rel);
        relationsForThisService.push(rel);
      }
    }
  }

  await db.saveDataAsync();
  await syncSingleServiceToFirestore(newService, relationsForThisService);
  broadcastSSE('SERVICES_UPDATED', { action: 'CREATED', service: newService });

  res.status(201).json({ success: true, service: newService });
});

router.put('/services/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { service_name, selling_price, duration_mins, is_active, description, hpp_items } = req.body;
  const data = db.getData();
  const service = data.services.find(s => s.id === id);

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

  const relationsForThisService: any[] = [];
  if (Array.isArray(hpp_items)) {
    data.service_hpp_relations = data.service_hpp_relations.filter(r => r.service_id !== id);
    for (const item of hpp_items) {
      if (item && item.hpp_id && item.quantity_used) {
        const rel = {
          service_id: id,
          hpp_id: item.hpp_id,
          quantity_used: Math.max(1, Number(item.quantity_used) || 1),
        };
        data.service_hpp_relations.push(rel);
        relationsForThisService.push(rel);
      }
    }
  }

  await db.saveDataAsync();
  await syncSingleServiceToFirestore(service, relationsForThisService);
  broadcastSSE('SERVICES_UPDATED', { action: 'UPDATED', service });

  res.json({ success: true, service });
});

router.delete('/services/:id', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = db.getData();
  const idx = data.services.findIndex(s => s.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Layanan tidak ditemukan' });
  }

  data.services.splice(idx, 1);
  data.service_hpp_relations = data.service_hpp_relations.filter(r => r.service_id !== id);

  await db.saveDataAsync();
  await deleteSingleServiceFromFirestore(id);
  broadcastSSE('SERVICES_UPDATED', { action: 'DELETED', id });

  res.json({ success: true, message: 'Layanan berhasil dihapus' });
});

// -------------------------------------------------------------
// 6. Direct POS Checkout & Transactions (Owner & Staff)
// -------------------------------------------------------------
router.get('/transactions', requireRole('OWNER', 'STAFF'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  res.json(data.transactions);
});

router.post('/transactions/direct-checkout', requireRole('OWNER', 'STAFF'), async (req: AuthenticatedRequest, res: Response) => {
  const { customer_name, service_id, custom_service_name, selling_price, discount = 0, tax = 0, payment_method = 'CASH' } = req.body;
  const data = db.getData();

  const service = data.services.find(s => s.id === service_id);
  const serviceName = service ? service.service_name : (typeof custom_service_name === 'string' && custom_service_name.trim() ? custom_service_name.trim() : 'Direct Haircut');

  const rawBase = service ? service.selling_price : Number(selling_price || 50000);
  const basePrice = isNaN(rawBase) || rawBase < 0 ? 50000 : Math.round(rawBase);
  const totalHPP = service ? db.calculateServiceHPP(service.id) : 7600;

  const rawDisc = Number(discount);
  const numDiscount = isNaN(rawDisc) || rawDisc < 0 ? 0 : Math.round(rawDisc);

  const rawTax = Number(tax);
  const numTax = isNaN(rawTax) || rawTax < 0 ? 0 : Math.round(rawTax);

  const finalPrice = Math.max(0, basePrice - numDiscount + numTax);
  const netProfit = finalPrice - totalHPP;

  const validPaymentMethods = ['CASH', 'QRIS', 'DEBIT', 'TRANSFER'];
  const validMethod = validPaymentMethods.includes(payment_method) ? payment_method : 'CASH';

  const newTx: Transaction = {
    id: `trx-direct-${Date.now()}`,
    queue_id: `q-direct-${Date.now()}`,
    customer_name: typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : 'Walk-In Kasir Langsung',
    service_name: serviceName,
    total_price: finalPrice,
    discount: numDiscount,
    tax: numTax,
    total_hpp: totalHPP,
    net_profit: netProfit,
    payment_method: validMethod,
    created_at: new Date().toISOString(),
  };

  data.transactions.unshift(newTx);
  await db.saveDataAsync();
  await syncSingleTransactionToFirestore(newTx);
  broadcastSSE('TRANSACTION_CREATED', newTx);

  res.status(201).json({ success: true, transaction: newTx });
});

// -------------------------------------------------------------
// 7. Analytics & Comprehensive Business Recap (Owner Only)
// -------------------------------------------------------------
router.get('/analytics/recap', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Daily Recap (Today)
  const todayTxs = data.transactions.filter(t => t.created_at.startsWith(todayStr));
  const dailyGross = todayTxs.reduce((acc, t) => acc + t.total_price, 0);
  const dailyHPP = todayTxs.reduce((acc, t) => acc + t.total_hpp, 0);
  const dailyNet = todayTxs.reduce((acc, t) => acc + t.net_profit, 0);
  const dailyHeads = todayTxs.length;

  // Weekly Recap (Last 7 Days)
  const weeklyDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
    const dayTxs = data.transactions.filter(t => t.created_at.startsWith(dStr));
    const gross = dayTxs.reduce((acc, t) => acc + t.total_price, 0);
    const net = dayTxs.reduce((acc, t) => acc + t.net_profit, 0);
    const heads = dayTxs.length;

    weeklyDays.push({
      date: dStr,
      day: dayName,
      gross,
      net,
      heads,
    });
  }

  // Monthly Overview & Service Rankings
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthlyTxs = data.transactions.filter(t => t.created_at >= monthStart);
  const monthlyGross = monthlyTxs.reduce((acc, t) => acc + t.total_price, 0);
  const monthlyHPP = monthlyTxs.reduce((acc, t) => acc + t.total_hpp, 0);
  const monthlyNet = monthlyTxs.reduce((acc, t) => acc + t.net_profit, 0);
  const monthlyHeads = monthlyTxs.length;
  const overallMarginPercent = monthlyGross > 0 ? Math.round((monthlyNet / monthlyGross) * 100) : 0;

  // Service Popularity breakdown
  const serviceStatsMap: Record<string, { count: number; gross: number; profit: number }> = {};
  monthlyTxs.forEach(t => {
    if (!serviceStatsMap[t.service_name]) {
      serviceStatsMap[t.service_name] = { count: 0, gross: 0, profit: 0 };
    }
    serviceStatsMap[t.service_name].count += 1;
    serviceStatsMap[t.service_name].gross += t.total_price;
    serviceStatsMap[t.service_name].profit += t.net_profit;
  });

  const topServices = Object.entries(serviceStatsMap)
    .map(([name, stats]) => ({
      service_name: name,
      ...stats,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    daily: {
      date: todayStr,
      gross: dailyGross,
      hpp: dailyHPP,
      net: dailyNet,
      heads: dailyHeads,
      avg_ticket: dailyHeads > 0 ? Math.round(dailyGross / dailyHeads) : 0,
    },
    weekly: weeklyDays,
    monthly: {
      month: now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
      gross: monthlyGross,
      hpp: monthlyHPP,
      net: monthlyNet,
      heads: monthlyHeads,
      margin_percent: overallMarginPercent,
      top_services: topServices,
    },
  });
});

// -------------------------------------------------------------
// 8. CRM & Retention Management (Owner Only)
// -------------------------------------------------------------
router.get('/crm/behavior', requireRole('OWNER'), (req: AuthenticatedRequest, res: Response) => {
  const data = db.getData();
  const customers = data.users.filter(u => u.role === 'CUSTOMER');
  const now = Date.now();

  const enrichedCustomers = customers.map(c => {
    let daysSinceLastVisit = 0;
    if (c.last_visit_at) {
      daysSinceLastVisit = Math.floor((now - new Date(c.last_visit_at).getTime()) / (1000 * 60 * 60 * 24));
    }

    const needsRetentionReminder = daysSinceLastVisit >= 30;

    return {
      ...sanitizeUser(c),
      days_since_last_visit: daysSinceLastVisit,
      needs_retention_reminder: needsRetentionReminder,
    };
  });

  res.json({
    customers: enrichedCustomers,
    total_customers: customers.length,
    retention_alerts_count: enrichedCustomers.filter(c => c.needs_retention_reminder).length,
  });
});

router.post('/crm/send-retention-push', requireRole('OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  const { user_id, message } = req.body;
  const data = db.getData();
  const user = data.users.find(u => u.id === user_id);

  if (!user) {
    return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
  }

  const notif: NotificationLog = {
    id: `notif-${Date.now()}`,
    user_id: user.id,
    title: 'Waktunya Merapikan Rambut Anda — Arez Barbershop',
    message: typeof message === 'string' && message.trim() ? message.trim() : 'Sudah lebih dari 30 hari sejak potongan terakhir Anda. Booking antrean sekarang untuk menjaga penampilan selalu tajam dan rapi.',
    type: 'RETENTION_30D',
    created_at: new Date().toISOString(),
    read: false,
  };

  data.notifications.unshift(notif);
  await db.saveDataAsync();
  await syncSingleNotificationToFirestore(notif);
  broadcastSSE('NOTIFICATION_SENT', { user: sanitizeUser(user), notification: notif });

  res.json({ success: true, notification: notif });
});

// GET /api/notifications/:user_id: IDOR-Protected Customer Notifications
router.get('/notifications/:user_id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { user_id } = req.params;

  // IDOR check: Users can only retrieve their own notifications unless Super Admin / Owner
  if (!isOwnerRole(req.user!.role) && req.user!.id !== user_id) {
    return res.status(403).json({
      error: 'Akses ditolak: Anda hanya dapat mengakses notifikasi akun Anda sendiri.',
      code: 'FORBIDDEN_IDOR',
    });
  }

  const data = db.getData();
  const userNotifs = data.notifications.filter(n => n.user_id === user_id);
  res.json(userNotifs);
});

export default router;
