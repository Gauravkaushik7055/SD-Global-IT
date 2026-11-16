import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';

export const usersRouter = Router();

// List users (with moderator workload metrics when querying moderators)
usersRouter.get('/users', requireAuth, requireRole('super_admin', 'management', 'moderator'), (req, res) => {
  const role = String(req.query.role || '').trim();
  const search = String(req.query.search || '').trim();
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;

  // Moderators can only query moderators/employees for reference; restrict full list to super_admin/management unless role=moderator
  if (req.user!.role === 'moderator' && role !== 'moderator') {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (role && role !== 'all') {
    clauses.push('u.role = ?');
    params.push(role);
  }
  if (locationId) {
    clauses.push('u.location_id = ?');
    params.push(locationId);
  }
  if (search) {
    clauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ? OR u.employee_code LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat, pat);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.mobile, u.full_name, u.role, u.employee_code, u.designation,
              u.location_id, l.name as location_name, l.code as location_code,
              u.department_id, d.name as department_name,
              u.reporting_manager, u.must_reset_password, u.is_active,
              u.specialization, u.assigned_locations, u.capacity, u.rating, u.mod_status, u.last_seen_at, u.created_at,
              (SELECT COUNT(*) FROM tickets t WHERE t.assigned_moderator_id = u.id AND t.status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected')) as active_ticket_count,
              (SELECT COUNT(*) FROM tickets t WHERE t.assigned_moderator_id = u.id AND t.status IN ('Completed', 'Resolved', 'Closed')) as completed_ticket_count
       FROM users u
       LEFT JOIN locations l ON u.location_id = l.id
       LEFT JOIN departments d ON u.department_id = d.id
       ${whereSql}
       ORDER BY u.created_at DESC`
    )
    .all(...params);

  res.json({ users });
});

// Create user (moderator, management, or employee)
usersRouter.post('/users', requireAuth, requireRole('super_admin'), (req, res) => {
  const body = req.body || {};
  const fullName = String(body.fullName || '').trim();
  const role = String(body.role || 'employee').trim();
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const mobile = body.mobile ? String(body.mobile).replace(/\D/g, '').slice(-10) : null;
  const password = body.password ? String(body.password) : '';
  const generateInvite = Boolean(body.generateInvite);

  if (!fullName || !['moderator', 'employee', 'management'].includes(role)) {
    res.status(400).json({ error: 'Valid full name and role (moderator, employee, or management) are required' });
    return;
  }

  if ((role === 'moderator' || role === 'management') && !email) {
    res.status(400).json({ error: 'Corporate email is required for moderator and management accounts' });
    return;
  }

  if (email) {
    const exists = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
  }
  if (mobile) {
    const exists = db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
    if (exists) {
      res.status(409).json({ error: 'A user with this mobile number already exists' });
      return;
    }
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const assignedLocs = Array.isArray(body.assignedLocations) ? JSON.stringify(body.assignedLocations) : '[]';

  const info = db
    .prepare(
      `INSERT INTO users (
        email, mobile, password_hash, full_name, role, employee_code, designation,
        location_id, department_id, reporting_manager, must_reset_password, is_active,
        specialization, assigned_locations, capacity, mod_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    )
    .run(
      email,
      mobile || null,
      passwordHash,
      fullName,
      role,
      String(body.employeeCode || ''),
      String(body.designation || ''),
      body.locationId ? Number(body.locationId) : null,
      body.departmentId ? Number(body.departmentId) : null,
      String(body.reportingManager || ''),
      body.mustResetPassword ? 1 : 0,
      String(body.specialization || ''),
      assignedLocs,
      Math.max(1, Number(body.capacity || 10)),
      String(body.modStatus || 'available')
    );

  const userId = Number(info.lastInsertRowid);
  let inviteToken: string | null = null;

  if (role === 'moderator' && (generateInvite || !passwordHash)) {
    inviteToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO moderator_invites (user_id, token, type, expires_at, is_active, created_by)
       VALUES (?, ?, 'invite', ?, 1, ?)`
    ).run(userId, inviteToken, expiresAt, req.user!.id);
  }

  recordAudit(req.user!, 'USER_CREATED', 'user', userId, `Created ${role}: ${fullName}`, getClientIp(req));
  const created = db.prepare('SELECT id, email, mobile, full_name, role, employee_code, is_active FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: created, inviteToken });
});

// Update user profile, status, moderator capacity, or forced password reset
usersRouter.patch('/users/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const body = req.body || {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.fullName !== undefined) {
    updates.push('full_name = ?');
    params.push(String(body.fullName).trim());
  }
  if (body.designation !== undefined) {
    updates.push('designation = ?');
    params.push(String(body.designation).trim());
  }
  if (body.employeeCode !== undefined) {
    updates.push('employee_code = ?');
    params.push(String(body.employeeCode).trim());
  }
  if (body.locationId !== undefined) {
    updates.push('location_id = ?');
    params.push(body.locationId ? Number(body.locationId) : null);
  }
  if (body.departmentId !== undefined) {
    updates.push('department_id = ?');
    params.push(body.departmentId ? Number(body.departmentId) : null);
  }
  if (body.reportingManager !== undefined) {
    updates.push('reporting_manager = ?');
    params.push(String(body.reportingManager).trim());
  }
  if (body.isActive !== undefined && target.id !== req.user!.id) {
    updates.push('is_active = ?');
    params.push(body.isActive ? 1 : 0);
  }
  if (body.mustResetPassword !== undefined) {
    updates.push('must_reset_password = ?');
    params.push(body.mustResetPassword ? 1 : 0);
  }
  if (body.specialization !== undefined) {
    updates.push('specialization = ?');
    params.push(String(body.specialization));
  }
  if (body.assignedLocations !== undefined) {
    updates.push('assigned_locations = ?');
    params.push(JSON.stringify(body.assignedLocations));
  }
  if (body.capacity !== undefined) {
    updates.push('capacity = ?');
    params.push(Math.max(1, Number(body.capacity)));
  }
  if (body.modStatus !== undefined) {
    updates.push('mod_status = ?');
    params.push(String(body.modStatus));
  }
  if (body.rating !== undefined) {
    updates.push('rating = ?');
    params.push(Number(body.rating));
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  recordAudit(req.user!, 'USER_UPDATED', 'user', id, `Updated fields for ${target.full_name}`, getClientIp(req));
  res.json({ ok: true });
});

// Bulk import employees from Excel parsed rows
usersRouter.post('/users/import', requireAuth, requireRole('super_admin'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    res.status(400).json({ error: 'No employee rows provided' });
    return;
  }

  const locations = db.prepare('SELECT id, name, code FROM locations').all() as { id: number; name: string; code: string }[];
  const departments = db.prepare('SELECT id, name, code FROM departments').all() as { id: number; name: string; code: string }[];

  let created = 0;
  let skipped = 0;

  const insertStmt = db.prepare(
    `INSERT INTO users (
      email, mobile, full_name, role, employee_code, designation,
      location_id, department_id, reporting_manager, is_active
    ) VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, ?, 1)`
  );

  const tx = db.transaction(() => {
    for (const r of rows) {
      const fullName = String(r.fullName || r['Full Name'] || '').trim();
      const mobile = String(r.mobile || r['Mobile'] || '').replace(/\D/g, '').slice(-10);
      const email = String(r.email || r['Email'] || '').trim().toLowerCase() || null;
      if (!fullName || (!mobile && !email)) {
        skipped++;
        continue;
      }

      const dup = mobile
        ? db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile)
        : db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (dup) {
        skipped++;
        continue;
      }

      const locText = String(r.location || r['Location'] || '').toLowerCase();
      const deptText = String(r.department || r['Department'] || '').toLowerCase();
      const loc = locations.find(
        (l) => l.code.toLowerCase() === locText || l.name.toLowerCase().includes(locText)
      );
      const dept = departments.find(
        (d) => d.code.toLowerCase() === deptText || d.name.toLowerCase().includes(deptText)
      );

      insertStmt.run(
        email,
        mobile || null,
        fullName,
        String(r.employeeCode || r['Employee Code'] || ''),
        String(r.designation || r['Designation'] || ''),
        loc?.id ?? null,
        dept?.id ?? null,
        String(r.reportingManager || r['Reporting Manager'] || '')
      );
      created++;
    }
  });

  tx();
  recordAudit(req.user!, 'EMPLOYEES_BULK_IMPORT', 'user', 'batch', `Imported ${created}, skipped ${skipped}`, getClientIp(req));
  res.json({ created, skipped });
});

// Moderator invite links & shared common moderator access link
usersRouter.get('/moderators/invites', requireAuth, requireRole('super_admin'), (_req, res) => {
  const invites = db
    .prepare(
      `SELECT mi.*, u.full_name, u.email
       FROM moderator_invites mi
       LEFT JOIN users u ON mi.user_id = u.id
       ORDER BY mi.created_at DESC`
    )
    .all();
  const commonLink = db
    .prepare("SELECT * FROM moderator_invites WHERE type = 'common' AND is_active = 1 ORDER BY id DESC LIMIT 1")
    .get();
  res.json({ invites, commonLink });
});

usersRouter.post('/moderators/:id/invite', requireAuth, requireRole('super_admin'), (req, res) => {
  const userId = Number(req.params.id);
  const mod = db.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'moderator'").get(userId) as
    | { id: number; full_name: string }
    | undefined;
  if (!mod) {
    res.status(404).json({ error: 'Moderator not found' });
    return;
  }

  db.prepare("UPDATE moderator_invites SET is_active = 0 WHERE user_id = ? AND type = 'invite'").run(userId);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO moderator_invites (user_id, token, type, expires_at, is_active, created_by)
     VALUES (?, ?, 'invite', ?, 1, ?)`
  ).run(userId, token, expiresAt, req.user!.id);

  recordAudit(req.user!, 'MODERATOR_INVITE_GENERATED', 'user', userId, `Generated 72h invite for ${mod.full_name}`, getClientIp(req));
  res.json({ token, expiresAt });
});

usersRouter.post('/moderators/common-link/regenerate', requireAuth, requireRole('super_admin'), (req, res) => {
  db.prepare("UPDATE moderator_invites SET is_active = 0 WHERE type = 'common'").run();
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(
    `INSERT INTO moderator_invites (user_id, token, type, is_active, created_by)
     VALUES (NULL, ?, 'common', 1, ?)`
  ).run(token, req.user!.id);

  recordAudit(req.user!, 'COMMON_MOD_LINK_REGENERATED', 'moderator_invite', 'common', 'Regenerated common moderator onboarding link', getClientIp(req));
  res.json({ token });
});
