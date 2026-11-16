import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.ts';
import { db } from './db.ts';

export type UserRole = 'super_admin' | 'moderator' | 'employee' | 'management';

export interface AuthUser {
  id: number;
  email: string | null;
  mobile: string | null;
  full_name: string;
  role: UserRole;
  employee_code: string;
  designation: string;
  location_id: number | null;
  department_id: number | null;
  reporting_manager: string;
  must_reset_password: number;
  is_active: number;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : queryToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; jti: string };
    const session = db
      .prepare('SELECT id, is_active, last_activity_at FROM user_sessions WHERE token_jti = ? AND user_id = ?')
      .get(decoded.jti, decoded.userId) as { id: number; is_active: number; last_activity_at: string } | undefined;

    if (!session || !session.is_active) {
      res.status(401).json({ error: 'Session expired or revoked' });
      return;
    }

    const user = db
      .prepare(
        `SELECT id, email, mobile, full_name, role, employee_code, designation,
                location_id, department_id, reporting_manager, must_reset_password, is_active
         FROM users WHERE id = ?`
      )
      .get(decoded.userId) as Omit<AuthUser, 'jti'> | undefined;

    if (!user || !user.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    // Update last_activity_at and last_seen_at at most once per 30 seconds
    const lastTs = Date.parse(session.last_activity_at + 'Z');
    if (Number.isNaN(lastTs) || Date.now() - lastTs > 30000) {
      db.prepare("UPDATE user_sessions SET last_activity_at = datetime('now') WHERE id = ?").run(session.id);
      db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);
    }

    req.user = { ...user, jti: decoded.jti };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}

// Sliding window in-memory rate limiter for auth & OTP routes
const rateBuckets = new Map<string, number[]>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (rateBuckets.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }

    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

export function recordAudit(
  user: Pick<AuthUser, 'id' | 'full_name' | 'role'> | null,
  action: string,
  entityType: string,
  entityId: string | number | bigint,
  details: string,
  ipAddress = ''
): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.id ?? null,
    user?.full_name ?? 'System',
    user?.role ?? 'system',
    action,
    entityType,
    String(entityId),
    details,
    ipAddress
  );
}
