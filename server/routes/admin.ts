import { Router } from 'express';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';

export const adminRouter = Router();

// Locations CRUD
adminRouter.get('/locations', requireAuth, (_req, res) => {
  const locations = db.prepare('SELECT * FROM locations ORDER BY name ASC').all();
  res.json({ locations });
});

adminRouter.post('/locations', requireAuth, requireRole('super_admin'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const code = String(b.code || '').trim().toUpperCase();
  const type = String(b.type || 'branch');
  const city = String(b.city || '').trim();
  const state = String(b.state || '').trim();
  if (!name || !code || !city) {
    res.status(400).json({ error: 'Location name, code, and city are required' });
    return;
  }
  const info = db
    .prepare('INSERT INTO locations (name, code, type, city, state, address, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, code, type, city, state, String(b.address || ''), String(b.contactPhone || ''));
  recordAudit(req.user!, 'LOCATION_CREATED', 'location', info.lastInsertRowid, `${name} (${code})`, getClientIp(req));
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/locations/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(
    `UPDATE locations
     SET name = COALESCE(?, name),
         type = COALESCE(?, type),
         city = COALESCE(?, city),
         state = COALESCE(?, state),
         address = COALESCE(?, address),
         contact_phone = COALESCE(?, contact_phone),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    b.name ?? null,
    b.type ?? null,
    b.city ?? null,
    b.state ?? null,
    b.address ?? null,
    b.contactPhone ?? null,
    b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
    id
  );
  recordAudit(req.user!, 'LOCATION_UPDATED', 'location', id, 'Updated location', getClientIp(req));
  res.json({ ok: true });
});

// Departments CRUD
adminRouter.get('/departments', requireAuth, (_req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
  res.json({ departments });
});

adminRouter.post('/departments', requireAuth, requireRole('super_admin'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const code = String(b.code || '').trim().toUpperCase();
  const costCenter = String(b.costCenter || '').trim().toUpperCase();
  if (!name || !code || !costCenter) {
    res.status(400).json({ error: 'Department name, code, and cost center are required' });
    return;
  }
  const info = db
    .prepare('INSERT INTO departments (name, code, cost_center, head_name) VALUES (?, ?, ?, ?)')
    .run(name, code, costCenter, String(b.headName || ''));
  recordAudit(req.user!, 'DEPARTMENT_CREATED', 'department', info.lastInsertRowid, `${name} (${costCenter})`, getClientIp(req));
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/departments/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(
    `UPDATE departments
     SET name = COALESCE(?, name),
         cost_center = COALESCE(?, cost_center),
         head_name = COALESCE(?, head_name),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(b.name ?? null, b.costCenter ?? null, b.headName ?? null, b.isActive !== undefined ? (b.isActive ? 1 : 0) : null, id);
  recordAudit(req.user!, 'DEPARTMENT_UPDATED', 'department', id, 'Updated department', getClientIp(req));
  res.json({ ok: true });
});

// SLA Configurations
adminRouter.get('/sla-configs', requireAuth, (_req, res) => {
  const configs = db
    .prepare("SELECT * FROM sla_configs ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END")
    .all();
  res.json({ configs });
});

adminRouter.patch('/sla-configs/:priority', requireAuth, requireRole('super_admin'), (req, res) => {
  const priority = String(req.params.priority);
  const b = req.body || {};
  db.prepare(
    `UPDATE sla_configs
     SET first_response_minutes = COALESCE(?, first_response_minutes),
         resolution_hours = COALESCE(?, resolution_hours),
         work_start_hour = COALESCE(?, work_start_hour),
         work_end_hour = COALESCE(?, work_end_hour),
         working_days = COALESCE(?, working_days),
         holidays = COALESCE(?, holidays),
         auto_escalate = COALESCE(?, auto_escalate),
         escalation_email = COALESCE(?, escalation_email),
         updated_at = datetime('now')
     WHERE priority = ?`
  ).run(
    b.firstResponseMinutes !== undefined ? Number(b.firstResponseMinutes) : null,
    b.resolutionHours !== undefined ? Number(b.resolutionHours) : null,
    b.workStartHour !== undefined ? Number(b.workStartHour) : null,
    b.workEndHour !== undefined ? Number(b.workEndHour) : null,
    b.workingDays ? JSON.stringify(b.workingDays) : null,
    b.holidays ? JSON.stringify(b.holidays) : null,
    b.autoEscalate !== undefined ? (b.autoEscalate ? 1 : 0) : null,
    b.escalationEmail ?? null,
    priority
  );
  recordAudit(req.user!, 'SLA_UPDATED', 'sla_config', priority, `Updated ${priority} SLA rules`, getClientIp(req));
  res.json({ ok: true });
});

// Dropdown Manager
adminRouter.get('/dropdowns', requireAuth, (req, res) => {
  const listKey = req.query.listKey ? String(req.query.listKey) : null;
  const includeInactive = req.query.includeInactive === 'true';
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (listKey) {
    clauses.push('list_key = ?');
    params.push(listKey);
  }
  if (!includeInactive) {
    clauses.push('is_active = 1');
  }
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const options = db
    .prepare(`SELECT * FROM dropdown_options ${whereSql} ORDER BY list_key ASC, sort_order ASC, id ASC`)
    .all(...params);
  res.json({ options });
});

adminRouter.post('/dropdowns', requireAuth, requireRole('super_admin'), (req, res) => {
  const b = req.body || {};
  const listKey = String(b.listKey || '').trim();
  const label = String(b.label || '').trim();
  const value = String(b.value || label).trim();
  if (!listKey || !label) {
    res.status(400).json({ error: 'List key and label are required' });
    return;
  }
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM dropdown_options WHERE list_key = ?')
    .get(listKey) as { m: number };
  const info = db
    .prepare('INSERT INTO dropdown_options (list_key, label, value, sort_order) VALUES (?, ?, ?, ?)')
    .run(listKey, label, value, maxRow.m + 1);
  recordAudit(req.user!, 'DROPDOWN_ADDED', 'dropdown_option', info.lastInsertRowid, `${listKey}: ${label}`, getClientIp(req));
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.patch('/dropdowns/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(
    `UPDATE dropdown_options
     SET label = COALESCE(?, label),
         value = COALESCE(?, value),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    b.label ?? null,
    b.value ?? null,
    b.sortOrder !== undefined ? Number(b.sortOrder) : null,
    b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
    id
  );
  res.json({ ok: true });
});

adminRouter.post('/dropdowns/reorder', requireAuth, requireRole('super_admin'), (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(Number) : [];
  const update = db.prepare('UPDATE dropdown_options SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id: number, idx: number) => update.run(idx + 1, id));
  });
  tx();
  res.json({ ok: true });
});

adminRouter.delete('/dropdowns/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM dropdown_options WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Sessions & Audit Logs (super_admin only)
adminRouter.get('/sessions', requireAuth, requireRole('super_admin'), (_req, res) => {
  const sessions = db
    .prepare(
      `SELECT s.*, u.full_name, u.email, u.mobile, u.role
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.login_at DESC
       LIMIT 200`
    )
    .all();
  res.json({ sessions });
});

adminRouter.delete('/sessions/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE user_sessions SET is_active = 0, logout_at = datetime('now') WHERE id = ?").run(id);
  recordAudit(req.user!, 'SESSION_REVOKED', 'user_session', id, 'Admin terminated user session', getClientIp(req));
  res.json({ ok: true });
});

adminRouter.get('/audit-logs', requireAuth, requireRole('super_admin'), (req, res) => {
  const search = String(req.query.search || '').trim();
  const limit = Math.min(500, Math.max(20, Number(req.query.limit || 200)));
  const whereSql = search ? 'WHERE action LIKE ? OR user_name LIKE ? OR entity_type LIKE ? OR details LIKE ?' : '';
  const pat = `%${search}%`;
  const logs = db
    .prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ?`)
    .all(...(search ? [pat, pat, pat, pat, limit] : [limit]));
  res.json({ logs });
});

// Role-specific Dashboard Summary & Charts
adminRouter.get('/dashboard/summary', requireAuth, (req, res) => {
  const user = req.user!;
  const isStaffWide = user.role === 'super_admin' || user.role === 'management';

  let scopeSql = '';
  const scopeParams: unknown[] = [];
  if (user.role === 'employee') {
    scopeSql = 'WHERE reporter_id = ?';
    scopeParams.push(user.id);
  } else if (user.role === 'moderator') {
    scopeSql = 'WHERE assigned_moderator_id = ?';
    scopeParams.push(user.id);
  }

  const kpis = db
    .prepare(
      `SELECT
        COUNT(*) as total_tickets,
        SUM(CASE WHEN status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected') THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN status IN ('Completed', 'Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_tickets,
        SUM(CASE WHEN sla_breached = 1 AND status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected') THEN 1 ELSE 0 END) as active_breaches,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as total_breached,
        SUM(CASE WHEN priority = 'Critical' AND status NOT IN ('Completed', 'Resolved', 'Closed') THEN 1 ELSE 0 END) as critical_open,
        ROUND(AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at) - julianday(created_at)) * 24.0 END), 1) as avg_mttr_hours,
        ROUND(AVG(NULLIF(total_working_minutes, 0)), 0) as avg_work_minutes
       FROM tickets ${scopeSql}`
    )
    .get(...scopeParams) as Record<string, number | null>;

  const statusMix = db
    .prepare(`SELECT status, COUNT(*) as count FROM tickets ${scopeSql} GROUP BY status ORDER BY count DESC`)
    .all(...scopeParams);

  const priorityMix = db
    .prepare(`SELECT priority, COUNT(*) as count FROM tickets ${scopeSql} GROUP BY priority`)
    .all(...scopeParams);

  const volumeTrend = db
    .prepare(
      `SELECT date(created_at) as day,
              COUNT(*) as created,
              SUM(CASE WHEN status IN ('Completed', 'Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
       FROM tickets
       ${scopeSql ? scopeSql + " AND created_at >= datetime('now', '-14 days')" : "WHERE created_at >= datetime('now', '-14 days')"}
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all(...scopeParams);

  let locationHeatmap: unknown[] = [];
  let moderatorWorkload: unknown[] = [];
  let budgetSummary: unknown[] = [];
  let assetStats: Record<string, unknown> = {};

  if (isStaffWide) {
    locationHeatmap = db
      .prepare(
        `SELECT l.id, l.name, l.code, l.city,
                COUNT(t.id) as total_tickets,
                SUM(CASE WHEN t.status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected') THEN 1 ELSE 0 END) as open_tickets,
                SUM(CASE WHEN t.sla_breached = 1 THEN 1 ELSE 0 END) as breached_tickets
         FROM locations l
         LEFT JOIN tickets t ON t.location_id = l.id
         GROUP BY l.id
         ORDER BY open_tickets DESC, total_tickets DESC`
      )
      .all();

    moderatorWorkload = db
      .prepare(
        `SELECT u.id, u.full_name, u.specialization, u.capacity, u.rating, u.mod_status,
                COUNT(CASE WHEN t.status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected') THEN 1 END) as active_tickets,
                COUNT(CASE WHEN t.status IN ('Completed', 'Resolved', 'Closed') THEN 1 END) as completed_tickets,
                COALESCE(SUM(t.total_working_minutes), 0) as total_minutes
         FROM users u
         LEFT JOIN tickets t ON t.assigned_moderator_id = u.id
         WHERE u.role = 'moderator' AND u.is_active = 1
         GROUP BY u.id
         ORDER BY active_tickets DESC`
      )
      .all();

    const yr = String(new Date().getFullYear());
    budgetSummary = db
      .prepare(
        `SELECT l.name as location_name, l.code as location_code,
                COALESCE(SUM(b.allocated_amount), 0) as allocated,
                COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.location_id = l.id AND e.status = 'Approved' AND strftime('%Y', e.expense_date) = ?), 0) as spent
         FROM locations l
         LEFT JOIN budgets b ON b.location_id = l.id AND b.fiscal_year = ?
         GROUP BY l.id
         ORDER BY l.name ASC`
      )
      .all(yr, yr);

    assetStats = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN condition = 'Operational' THEN 1 ELSE 0 END) as operational,
                SUM(CASE WHEN condition = 'Under Repair' THEN 1 ELSE 0 END) as under_repair,
                COALESCE(SUM(purchase_cost), 0) as total_value
         FROM assets`
      )
      .get() as Record<string, unknown>;
  }

  res.json({
    kpis,
    statusMix,
    priorityMix,
    volumeTrend,
    locationHeatmap,
    moderatorWorkload,
    budgetSummary,
    assetStats,
  });
});

// Structured Reports for Export (PDF & Excel)
adminRouter.get('/reports/:type', requireAuth, requireRole('super_admin', 'management'), (req, res) => {
  const type = String(req.params.type);
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const fromDate = req.query.fromDate ? String(req.query.fromDate) : null;
  const toDate = req.query.toDate ? String(req.query.toDate) : null;

  if (type === 'tickets') {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (locationId) {
      clauses.push('t.location_id = ?');
      params.push(locationId);
    }
    if (fromDate) {
      clauses.push('date(t.created_at) >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      clauses.push('date(t.created_at) <= ?');
      params.push(toDate);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT t.ticket_number, t.created_at, t.reporter_name, l.name as location, t.category, t.device_type,
                t.priority, t.business_impact, t.status, m.full_name as moderator, t.total_working_minutes,
                t.expenses_incurred, CASE WHEN t.sla_breached = 1 THEN 'Breached' ELSE 'Within SLA' END as sla_state
         FROM tickets t
         LEFT JOIN locations l ON t.location_id = l.id
         LEFT JOIN users m ON t.assigned_moderator_id = m.id
         ${whereSql}
         ORDER BY t.created_at DESC`
      )
      .all(...params);
    res.json({ rows });
  } else if (type === 'sla') {
    const rows = db
      .prepare(
        `SELECT t.priority,
                COUNT(*) as total,
                SUM(CASE WHEN t.sla_breached = 0 THEN 1 ELSE 0 END) as compliant,
                SUM(CASE WHEN t.sla_breached = 1 THEN 1 ELSE 0 END) as breached,
                ROUND(100.0 * SUM(CASE WHEN t.sla_breached = 0 THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 1) as compliance_pct,
                ROUND(AVG(CASE WHEN t.completed_at IS NOT NULL THEN (julianday(t.completed_at) - julianday(t.created_at)) * 24.0 END), 2) as avg_resolution_hours
         FROM tickets t
         GROUP BY t.priority`
      )
      .all();
    res.json({ rows });
  } else if (type === 'assets') {
    const rows = db
      .prepare(
        `SELECT a.asset_tag, a.serial_number, a.category, a.brand, a.model, a.condition,
                l.name as location, u.full_name as assigned_to, a.purchase_date, a.purchase_cost, a.warranty_expiry
         FROM assets a
         LEFT JOIN locations l ON a.location_id = l.id
         LEFT JOIN users u ON a.assigned_user_id = u.id
         ${locationId ? 'WHERE a.location_id = ?' : ''}
         ORDER BY a.asset_tag ASC`
      )
      .all(...(locationId ? [locationId] : []));
    res.json({ rows });
  } else if (type === 'expenses') {
    const rows = db
      .prepare(
        `SELECT e.expense_date, l.name as location, e.category, v.name as vendor, e.invoice_number,
                e.amount, e.status, e.description, su.full_name as submitted_by
         FROM expenses e
         LEFT JOIN locations l ON e.location_id = l.id
         LEFT JOIN vendors v ON e.vendor_id = v.id
         LEFT JOIN users su ON e.submitted_by = su.id
         ${locationId ? 'WHERE e.location_id = ?' : ''}
         ORDER BY e.expense_date DESC`
      )
      .all(...(locationId ? [locationId] : []));
    res.json({ rows });
  } else if (type === 'moderators') {
    const rows = db
      .prepare(
        `SELECT u.full_name, u.email, u.specialization, u.mod_status, u.capacity, u.rating,
                COUNT(t.id) as total_assigned,
                SUM(CASE WHEN t.status IN ('Completed', 'Resolved', 'Closed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
                COALESCE(SUM(t.total_working_minutes), 0) as total_minutes_logged
         FROM users u
         LEFT JOIN tickets t ON t.assigned_moderator_id = u.id
         WHERE u.role = 'moderator'
         GROUP BY u.id
         ORDER BY completed DESC`
      )
      .all();
    res.json({ rows });
  } else {
    res.status(400).json({ error: 'Unknown report type' });
  }
});
