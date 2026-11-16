import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.ts';
import { db } from '../db.ts';
import { getClientIp, rateLimit, recordAudit, requireAuth } from '../middleware.ts';

export const authRouter = Router();

function createSessionAndToken(user: {
  id: number;
  role: string;
  email: string | null;
  mobile: string | null;
  full_name: string;
}, req: Parameters<typeof getClientIp>[0]): string {
  const jti = crypto.randomUUID();
  const ip = getClientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);

  db.prepare(
    `INSERT INTO user_sessions (user_id, token_jti, ip_address, user_agent, is_active)
     VALUES (?, ?, ?, ?, 1)`
  ).run(user.id, jti, ip, ua);

  db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);

  return jwt.sign({ userId: user.id, role: user.role, jti }, JWT_SECRET, { expiresIn: '7d' });
}

function getFullUserProfile(userId: number) {
  return db
    .prepare(
      `SELECT u.id, u.email, u.mobile, u.full_name, u.role, u.employee_code, u.designation,
              u.location_id, l.name as location_name, l.code as location_code, l.city as location_city,
              u.department_id, d.name as department_name, d.cost_center as department_cost_center,
              u.reporting_manager, u.must_reset_password, u.is_active,
              u.specialization, u.assigned_locations, u.capacity, u.rating, u.mod_status, u.last_seen_at
       FROM users u
       LEFT JOIN locations l ON u.location_id = l.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`
    )
    .get(userId);
}

// Public metadata for employee OTP first-login location/department selection
authRouter.get('/public/metadata', (_req, res) => {
  const locations = db
    .prepare('SELECT id, name, code, type, city, state FROM locations WHERE is_active = 1 ORDER BY name ASC')
    .all();
  const departments = db
    .prepare('SELECT id, name, code, cost_center FROM departments WHERE is_active = 1 ORDER BY name ASC')
    .all();
  res.json({ locations, departments });
});

// Staff login (Super Admin, Moderator, Management)
authRouter.post('/auth/login', rateLimit('login', 15, 60 * 1000), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db
    .prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1')
    .get(email) as {
    id: number;
    email: string;
    mobile: string | null;
    password_hash: string | null;
    full_name: string;
    role: string;
    is_active: number;
    must_reset_password: number;
  } | undefined;

  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    recordAudit(null, 'LOGIN_FAILED', 'auth', email, 'Invalid staff email or password', getClientIp(req));
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Your account has been deactivated. Contact IT Head.' });
    return;
  }

  const token = createSessionAndToken(user, req);
  recordAudit(
    { id: user.id, full_name: user.full_name, role: user.role as 'super_admin' },
    'LOGIN_SUCCESS',
    'auth',
    user.id,
    'Staff email login',
    getClientIp(req)
  );

  res.json({
    token,
    user: getFullUserProfile(user.id),
    mustResetPassword: Boolean(user.must_reset_password),
  });
});

// Request Mobile OTP for Employee login (no pre-registration needed)
authRouter.post('/auth/request-otp', rateLimit('otp_request', 6, 60 * 1000), (req, res) => {
  const rawMobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const mobile = rawMobile.length > 10 ? rawMobile.slice(-10) : rawMobile;

  if (!/^[6-9]\d{9}$/.test(mobile) && !/^\d{10}$/.test(mobile)) {
    res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    return;
  }

  const existingUser = db.prepare('SELECT id, role, is_active FROM users WHERE mobile = ? LIMIT 1').get(mobile) as
    | { id: number; role: string; is_active: number }
    | undefined;

  if (existingUser && !existingUser.is_active) {
    res.status(403).json({ error: 'This account is deactivated. Contact IT Support.' });
    return;
  }

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = bcrypt.hashSync(code, 8);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO otp_codes (mobile, code_hash, expires_at) VALUES (?, ?, ?)').run(mobile, codeHash, expiresAt);

  recordAudit(null, 'OTP_REQUESTED', 'auth', mobile, 'Employee mobile OTP generated', getClientIp(req));

  res.json({
    sent: true,
    isNewEmployee: !existingUser,
    expiresInSeconds: 600,
    // Provided for local/sandbox verification when an external SMS gateway is not attached
    previewOtp: process.env.SMS_GATEWAY_ENABLED === 'true' ? undefined : code,
  });
});

// Verify Mobile OTP and create employee profile on first login if needed
authRouter.post('/auth/verify-otp', rateLimit('otp_verify', 12, 60 * 1000), (req, res) => {
  const rawMobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const mobile = rawMobile.length > 10 ? rawMobile.slice(-10) : rawMobile;
  const otp = String(req.body?.otp || '').trim();

  if (!/^\d{10}$/.test(mobile) || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: 'Valid 10-digit mobile and 6-digit OTP are required' });
    return;
  }

  const otpRow = db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE mobile = ? AND verified_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(mobile) as { id: number; code_hash: string; expires_at: string; attempts: number } | undefined;

  if (!otpRow) {
    res.status(400).json({ error: 'No active OTP found. Please request a new code.' });
    return;
  }

  if (otpRow.attempts >= 5) {
    res.status(429).json({ error: 'Too many invalid OTP attempts. Request a new code.' });
    return;
  }

  if (Date.parse(otpRow.expires_at) < Date.now()) {
    res.status(400).json({ error: 'OTP has expired. Request a new code.' });
    return;
  }

  if (!bcrypt.compareSync(otp, otpRow.code_hash)) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(otpRow.id);
    res.status(401).json({ error: 'Incorrect OTP code' });
    return;
  }

  db.prepare("UPDATE otp_codes SET verified_at = datetime('now') WHERE id = ?").run(otpRow.id);

  let user = db.prepare('SELECT * FROM users WHERE mobile = ? LIMIT 1').get(mobile) as
    | { id: number; role: string; email: string | null; mobile: string; full_name: string; is_active: number }
    | undefined;

  if (!user) {
    const fullName = String(req.body?.fullName || '').trim();
    const locationId = Number(req.body?.locationId);
    const departmentId = Number(req.body?.departmentId);
    const employeeCode = String(req.body?.employeeCode || '').trim();
    const designation = String(req.body?.designation || '').trim();
    const reportingManager = String(req.body?.reportingManager || '').trim();

    if (!fullName || !locationId || !departmentId) {
      res.status(200).json({
        requiresProfile: true,
        message: 'OTP verified. Complete your branch and department details to finish first-time setup.',
      });
      return;
    }

    const loc = db.prepare('SELECT id FROM locations WHERE id = ? AND is_active = 1').get(locationId);
    const dept = db.prepare('SELECT id FROM departments WHERE id = ? AND is_active = 1').get(departmentId);
    if (!loc || !dept) {
      res.status(400).json({ error: 'Selected location or department is invalid' });
      return;
    }

    const generatedEmpCode = employeeCode || `EMP-${mobile.slice(-4)}`;
    const insert = db
      .prepare(
        `INSERT INTO users (
          mobile, full_name, role, employee_code, designation,
          location_id, department_id, reporting_manager, is_active
        ) VALUES (?, ?, 'employee', ?, ?, ?, ?, ?, 1)`
      )
      .run(mobile, fullName, generatedEmpCode, designation || 'Operations Staff', locationId, departmentId, reportingManager);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(insert.lastInsertRowid) as typeof user;
    recordAudit(
      { id: user!.id, full_name: user!.full_name, role: 'employee' },
      'EMPLOYEE_SELF_REGISTERED',
      'user',
      user!.id,
      `First-login OTP registration (${mobile})`,
      getClientIp(req)
    );
  } else if (!user.is_active) {
    res.status(403).json({ error: 'Account deactivated. Contact IT Support.' });
    return;
  }

  const token = createSessionAndToken(user!, req);
  recordAudit(
    { id: user!.id, full_name: user!.full_name, role: user!.role as 'employee' },
    'LOGIN_OTP_SUCCESS',
    'auth',
    user!.id,
    `Employee OTP login (${mobile})`,
    getClientIp(req)
  );

  res.json({
    token,
    user: getFullUserProfile(user!.id),
  });
});

// Forgot password (generates expiring token)
authRouter.post('/auth/forgot-password', rateLimit('forgot_pw', 5, 60 * 1000), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email address is required' });
    return;
  }

  const user = db.prepare('SELECT id, full_name, role, is_active FROM users WHERE LOWER(email) = ? LIMIT 1').get(email) as
    | { id: number; full_name: string; role: string; is_active: number }
    | undefined;

  if (!user || !user.is_active) {
    // Generic response to avoid account enumeration
    res.json({ ok: true, message: 'If an active staff account matches this email, a reset token has been generated.' });
    return;
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

  recordAudit(
    { id: user.id, full_name: user.full_name, role: user.role as 'moderator' },
    'PASSWORD_RESET_REQUESTED',
    'auth',
    user.id,
    'Reset token issued',
    getClientIp(req)
  );

  res.json({
    ok: true,
    message: 'Reset token issued (valid for 30 minutes).',
    // Available when SMTP is not attached so admins/users can test the flow directly
    resetTokenPreview: process.env.SMTP_HOST ? undefined : token,
  });
});

// Reset password using token
authRouter.post('/auth/reset-password', rateLimit('reset_pw', 10, 60 * 1000), (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!token || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid reset token and password (min 8 characters) are required' });
    return;
  }

  const resetRow = db
    .prepare('SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL LIMIT 1')
    .get(token) as { id: number; user_id: number; expires_at: string } | undefined;

  if (!resetRow || Date.parse(resetRow.expires_at) < Date.now()) {
    res.status(400).json({ error: 'Reset token is invalid or expired' });
    return;
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?').run(hash, resetRow.user_id);
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(resetRow.id);

  recordAudit(null, 'PASSWORD_RESET_COMPLETED', 'user', resetRow.user_id, 'Password updated via reset token', getClientIp(req));
  res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
});

// Change password while authenticated (also resolves forced reset)
authRouter.post('/auth/change-password', requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const user = db.prepare('SELECT id, password_hash, must_reset_password FROM users WHERE id = ?').get(req.user!.id) as {
    id: number;
    password_hash: string | null;
    must_reset_password: number;
  };

  if (!user.must_reset_password && user.password_hash) {
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?').run(hash, user.id);

  recordAudit(req.user!, 'PASSWORD_CHANGED', 'user', user.id, 'User changed password', getClientIp(req));
  res.json({ ok: true, user: getFullUserProfile(user.id) });
});

// Inspect moderator invite or common link
authRouter.get('/auth/invite/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  const invite = db
    .prepare(
      `SELECT mi.*, u.full_name, u.email, u.specialization, u.employee_code
       FROM moderator_invites mi
       LEFT JOIN users u ON mi.user_id = u.id
       WHERE mi.token = ? AND mi.is_active = 1 LIMIT 1`
    )
    .get(token) as
    | {
        id: number;
        user_id: number | null;
        type: 'invite' | 'common';
        expires_at: string | null;
        used_at: string | null;
        full_name: string | null;
        email: string | null;
        specialization: string | null;
      }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite link is invalid or revoked' });
    return;
  }

  if (invite.type === 'invite') {
    if (invite.used_at) {
      res.status(400).json({ error: 'This one-time invite link has already been used' });
      return;
    }
    if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) {
      res.status(400).json({ error: 'This invite link has expired' });
      return;
    }
  }

  res.json({
    valid: true,
    type: invite.type,
    fullName: invite.full_name,
    email: invite.email,
    specialization: invite.specialization,
  });
});

// Accept moderator invite (one-time or common link)
authRouter.post('/auth/accept-invite', rateLimit('accept_invite', 10, 60 * 1000), (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || password.length < 8) {
    res.status(400).json({ error: 'Valid invite token and password (min 8 characters) are required' });
    return;
  }

  const invite = db
    .prepare('SELECT * FROM moderator_invites WHERE token = ? AND is_active = 1 LIMIT 1')
    .get(token) as
    | {
        id: number;
        user_id: number | null;
        type: 'invite' | 'common';
        expires_at: string | null;
        used_at: string | null;
      }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite link is invalid or deactivated' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  if (invite.type === 'invite') {
    if (invite.used_at || (invite.expires_at && Date.parse(invite.expires_at) < Date.now())) {
      res.status(400).json({ error: 'One-time invite link is expired or already used' });
      return;
    }

    db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0, is_active = 1 WHERE id = ?').run(
      passwordHash,
      invite.user_id
    );
    db.prepare("UPDATE moderator_invites SET used_at = datetime('now'), is_active = 0 WHERE id = ?").run(invite.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(invite.user_id) as {
      id: number;
      role: string;
      email: string;
      mobile: string | null;
      full_name: string;
    };
    const jwtToken = createSessionAndToken(user, req);
    recordAudit(
      { id: user.id, full_name: user.full_name, role: 'moderator' },
      'MODERATOR_INVITE_ACCEPTED',
      'user',
      user.id,
      'Moderator activated account via one-time invite',
      getClientIp(req)
    );
    res.json({ token: jwtToken, user: getFullUserProfile(user.id) });
    return;
  }

  // Common moderator access link: create new moderator or sign in existing if matching
  const email = String(req.body?.email || '').trim().toLowerCase();
  const fullName = String(req.body?.fullName || '').trim();
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '').slice(-10);
  const specialization = String(req.body?.specialization || 'General IT Support').trim();

  if (!email || !fullName) {
    res.status(400).json({ error: 'Full name and corporate email are required for common link onboarding' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists. Please use Staff Login.' });
    return;
  }

  const insert = db
    .prepare(
      `INSERT INTO users (
        email, mobile, password_hash, full_name, role, employee_code, designation,
        specialization, capacity, mod_status, is_active
      ) VALUES (?, ?, ?, ?, 'moderator', ?, 'IT Support Technician', ?, 10, 'available', 1)`
    )
    .run(email, mobile || null, passwordHash, fullName, `MOD-${crypto.randomInt(1000, 9999)}`, specialization);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(insert.lastInsertRowid) as {
    id: number;
    role: string;
    email: string;
    mobile: string | null;
    full_name: string;
  };
  const jwtToken = createSessionAndToken(user, req);
  recordAudit(
    { id: user.id, full_name: user.full_name, role: 'moderator' },
    'MODERATOR_COMMON_LINK_JOINED',
    'user',
    user.id,
    `Moderator onboarded via shared access link (${email})`,
    getClientIp(req)
  );
  res.json({ token: jwtToken, user: getFullUserProfile(user.id) });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  const user = getFullUserProfile(req.user!.id);
  const unreadNotifications = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as {
      c: number;
    }
  ).c;
  const unreadChat = (
    db.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE receiver_id = ? AND is_read = 0').get(req.user!.id) as {
      c: number;
    }
  ).c;

  res.json({ user, unreadNotifications, unreadChat });
});

authRouter.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare("UPDATE user_sessions SET is_active = 0, logout_at = datetime('now') WHERE token_jti = ?").run(
    req.user!.jti
  );
  recordAudit(req.user!, 'LOGOUT', 'auth', req.user!.id, 'User signed out', getClientIp(req));
  res.json({ ok: true });
});
