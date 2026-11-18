import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db, UserRole } from './db.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'arez_session_v2_auto_fallback_x89f_2026';
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

export interface SessionData {
  sessionId: string;
  userId: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

// In-Memory Active Session Cache (O(1) Map lookup)
const sessions = new Map<string, SessionData>();

export const PASSWORD_HASH_ITERATIONS = 100000;
const HASH_SCHEME = 'pbkdf2_sha256';

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function safeTimingEqualHex(hexA: string, hexB: string): boolean {
  try {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) {
    return false;
  }
}

/**
 * Generates a tamper-proof cryptographically signed persistent token.
 * Format: arez_v2.<userId>.<role>.<expiresAt>.<signature>
 */
export function generateSignedToken(userId: string, role: UserRole, expiresAt = Date.now() + SESSION_TTL_MS): string {
  const payload = `${userId}.${role}.${expiresAt}`;
  const sig = signPayload(payload);
  return `arez_v2.${payload}.${sig}`;
}

/**
 * Verifies a signed token in O(1) time using HashSet & Timestamp checks.
 * Backdoor static tokens have been completely removed.
 */
export function verifySignedToken(token: string): { valid: boolean; userId: string; role: UserRole } | null {
  try {
    if (!token || typeof token !== 'string') return null;

    // O(1) Set lookup for explicitly revoked tokens
    if (db.revokedTokensSet.has(token)) return null;

    if (token.startsWith('arez_v2.')) {
      const parts = token.split('.');
      if (parts.length !== 5) return null;
      const [, userId, role, expiresAtStr, receivedSig] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);

      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        return null;
      }

      // Check per-user token revocation watermark (invalidates all prior tokens on deactivate/reset)
      const issuedAt = expiresAt - SESSION_TTL_MS;
      const revokedBefore = db.getData().revoked_before?.[userId] || 0;
      if (revokedBefore > 0 && issuedAt <= revokedBefore) {
        return null;
      }

      const expectedPayload = `${userId}.${role}.${expiresAtStr}`;
      const expectedSig = signPayload(expectedPayload);

      if (safeTimingEqualHex(receivedSig, expectedSig)) {
        const canonicalRole: UserRole = isOwnerRole(role) ? 'OWNER' : isStaffRole(role) ? 'STAFF' : 'CUSTOMER';
        return {
          valid: true,
          userId,
          role: canonicalRole,
        };
      }
      return null;
    }

    // Support in-memory cache lookup (O(1))
    const memSession = sessions.get(token);
    if (memSession && Date.now() <= memSession.expiresAt) {
      const revokedBefore = db.getData().revoked_before?.[memSession.userId] || 0;
      if (revokedBefore > 0 && memSession.createdAt <= revokedBefore) {
        sessions.delete(token);
        return null;
      }
      const canonicalRole: UserRole = isOwnerRole(memSession.role)
        ? 'OWNER'
        : isStaffRole(memSession.role)
        ? 'STAFF'
        : 'CUSTOMER';
      return {
        valid: true,
        userId: memSession.userId,
        role: canonicalRole,
      };
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Cryptographically secure password hashing using PBKDF2-HMAC-SHA256 (100,000 iterations + Random Salt)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 64, 'sha256').toString('hex');
  return `${HASH_SCHEME}$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

export interface PasswordVerifyResult {
  valid: boolean;
  needsRehash: boolean;
}

export function verifyPassword(password: string, combinedHash: string): PasswordVerifyResult {
  try {
    if (!combinedHash || typeof combinedHash !== 'string') {
      return { valid: false, needsRehash: false };
    }

    // Legacy plaintext fallback during migration
    if (combinedHash === password) {
      return { valid: true, needsRehash: true };
    }

    if (combinedHash.startsWith(`${HASH_SCHEME}$`)) {
      const parts = combinedHash.split('$');
      if (parts.length !== 4) return { valid: false, needsRehash: false };
      const [, iterStr, salt, originalHash] = parts;
      const iterations = parseInt(iterStr, 10);
      if (isNaN(iterations) || iterations <= 0) return { valid: false, needsRehash: false };

      const verifyHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
      const isValid = safeTimingEqualHex(originalHash, verifyHash);
      return {
        valid: isValid,
        needsRehash: isValid && iterations < PASSWORD_HASH_ITERATIONS,
      };
    }

    const parts = combinedHash.split(':');
    if (parts.length === 2) {
      const [salt, originalHash] = parts;
      const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
      const isValid = safeTimingEqualHex(originalHash, verifyHash);
      return {
        valid: isValid,
        needsRehash: isValid,
      };
    }

    return { valid: false, needsRehash: false };
  } catch (e) {
    return { valid: false, needsRehash: false };
  }
}

export function isOwnerRole(role?: string | null): boolean {
  if (!role) return false;
  const upper = String(role).toUpperCase();
  return upper === 'OWNER' || upper === 'SUPER_ADMIN' || upper === 'ADMIN' || upper === 'MANAGER';
}

export function isStaffRole(role?: string | null): boolean {
  if (!role) return false;
  const upper = String(role).toUpperCase();
  return upper === 'STAFF' || upper === 'BARBER' || upper === 'CASHIER';
}

export function createSession(userId: string, role: UserRole): SessionData {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const canonicalRole: UserRole = isOwnerRole(role) ? 'OWNER' : isStaffRole(role) ? 'STAFF' : 'CUSTOMER';
  const signedToken = generateSignedToken(userId, canonicalRole, expiresAt);

  const session: SessionData = {
    sessionId: signedToken,
    userId,
    role: canonicalRole,
    createdAt: now,
    expiresAt,
  };

  sessions.set(signedToken, session);
  return session;
}

export function getSession(sessionId: string): SessionData | null {
  const verified = verifySignedToken(sessionId);
  if (!verified) return null;

  return {
    sessionId,
    userId: verified.userId,
    role: verified.role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

export function revokeToken(tokenId: string): void {
  const data = db.getData();
  if (!data.revoked_tokens) {
    data.revoked_tokens = [];
  }
  if (!db.revokedTokensSet.has(tokenId)) {
    db.revokedTokensSet.add(tokenId);
    data.revoked_tokens.push(tokenId);
    db.saveData();
  }

  sessions.delete(tokenId);
}

export function destroySession(sessionId: string): void {
  revokeToken(sessionId);
}

/**
 * Invalidate all active and previously issued sessions for a specific user ID in O(1) watermark + O(active)
 */
export function destroyUserSessions(userId: string): void {
  const data = db.getData();
  if (!data.revoked_before) data.revoked_before = {};
  data.revoked_before[userId] = Date.now();

  if (!data.revoked_tokens) data.revoked_tokens = [];
  for (const [sessionId, session] of sessions.entries()) {
    if (session.userId === userId) {
      db.revokedTokensSet.add(sessionId);
      data.revoked_tokens.push(sessionId);
      sessions.delete(sessionId);
    }
  }

  db.saveData();
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    status?: 'ACTIVE' | 'INACTIVE';
    username?: string | null;
    full_name: string;
    email: string;
  } | null;
  sessionId?: string | null;
}

/**
 * Authentication Middleware: O(1) user lookup via db.usersById
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined = req.cookies?.arez_session;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7).trim();
  }

  if (token) {
    const verified = verifySignedToken(token);
    if (verified) {
      // O(1) HashMap lookup instead of O(N) array.find
      const user = db.usersById.get(verified.userId);
      if (user) {
        if (user.status === 'INACTIVE' || user.deleted_at) {
          destroySession(token);
          req.user = null;
          req.sessionId = null;
          return next();
        }

        const canonicalRole: UserRole = isOwnerRole(user.role)
          ? 'OWNER'
          : isStaffRole(user.role)
          ? 'STAFF'
          : 'CUSTOMER';

        req.user = {
          id: user.id,
          role: canonicalRole,
          status: user.status,
          username: user.username,
          full_name: user.full_name,
          email: user.email,
        };
        req.sessionId = token;
        return next();
      }
    }
  }

  req.user = null;
  req.sessionId = null;
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.',
      code: 'UNAUTHORIZED',
    });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Sesi login tidak ditemukan. Silakan masuk kembali.',
        code: 'UNAUTHORIZED',
      });
    }

    const userRole = String(req.user.role).toUpperCase();
    const isOwner = isOwnerRole(userRole);
    const isStaff = isStaffRole(userRole);

    let isAllowed = roles.includes(req.user.role);
    if (roles.includes('OWNER') && isOwner) isAllowed = true;
    if (roles.includes('STAFF') && (isStaff || isOwner)) isAllowed = true;

    if (!isAllowed) {
      return res.status(403).json({
        error: 'Akses ditolak. Anda tidak memiliki izin untuk melakukan aksi ini.',
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}
