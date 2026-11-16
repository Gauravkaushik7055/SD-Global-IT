import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { UPLOADS_DIR } from '../config.ts';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';
import { computeSlaDueDates } from '../slaEngine.ts';
import { createAndPushNotification, notifyAdmins } from '../ws.ts';

export const ticketsRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
});

function resolveMediaType(mime: string): 'photo' | 'video' | 'document' {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function nextTicketNumber(): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM tickets WHERE ticket_number LIKE ?")
    .get(`TKT-${year}-%`) as { c: number };
  const seq = String(row.c + 1).padStart(4, '0');
  return `TKT-${year}-${seq}`;
}

function logTicketActivity(ticketId: number, actorId: number | null, actorName: string, action: string, details: string) {
  db.prepare(
    `INSERT INTO ticket_activities (ticket_id, actor_id, actor_name, action, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(ticketId, actorId, actorName, action, details);
}

// List tickets (role-scoped + filter/sort/search)
ticketsRouter.get('/tickets', requireAuth, (req, res) => {
  const user = req.user!;
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const priority = String(req.query.priority || '').trim();
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const category = String(req.query.category || '').trim();
  const breached = req.query.breached === 'true';
  const assignedToMe = req.query.assignedToMe === 'true';

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'employee') {
    clauses.push('t.reporter_id = ?');
    params.push(user.id);
  } else if (user.role === 'moderator') {
    if (assignedToMe) {
      clauses.push('t.assigned_moderator_id = ?');
      params.push(user.id);
    } else {
      clauses.push('(t.assigned_moderator_id = ? OR t.reporter_id = ?)');
      params.push(user.id, user.id);
    }
  }

  if (search) {
    clauses.push(
      '(t.ticket_number LIKE ? OR t.reporter_name LIKE ? OR t.description LIKE ? OR t.device_name LIKE ? OR t.serial_number LIKE ?)'
    );
    const pat = `%${search}%`;
    params.push(pat, pat, pat, pat, pat);
  }

  if (status && status !== 'all') {
    clauses.push('t.status = ?');
    params.push(status);
  }

  if (priority && priority !== 'all') {
    clauses.push('t.priority = ?');
    params.push(priority);
  }

  if (locationId) {
    clauses.push('t.location_id = ?');
    params.push(locationId);
  }

  if (category && category !== 'all') {
    clauses.push('t.category = ?');
    params.push(category);
  }

  if (breached) {
    clauses.push('t.sla_breached = 1');
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sortField = String(req.query.sortBy || 'created_at');
  const sortDir = String(req.query.sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSorts: Record<string, string> = {
    created_at: 't.created_at',
    priority: "CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END",
    status: 't.status',
    resolution_due_at: 't.resolution_due_at',
    ticket_number: 't.ticket_number',
  };
  const orderSql = `${allowedSorts[sortField] || 't.created_at'} ${sortDir}`;

  const tickets = db
    .prepare(
      `SELECT t.*,
              l.name as location_name, l.code as location_code,
              d.name as department_name,
              m.full_name as moderator_name, m.email as moderator_email,
              a.asset_tag as linked_asset_tag
       FROM tickets t
       LEFT JOIN locations l ON t.location_id = l.id
       LEFT JOIN departments d ON t.department_id = d.id
       LEFT JOIN users m ON t.assigned_moderator_id = m.id
       LEFT JOIN assets a ON t.asset_id = a.id
       ${whereSql}
       ORDER BY ${orderSql}`
    )
    .all(...params);

  res.json({ tickets });
});

// Create ticket with up to 12 file attachments
ticketsRouter.post('/tickets', requireAuth, upload.array('attachments', 12), (req, res) => {
  const user = req.user!;
  const body = req.body || {};

  const category = String(body.category || '').trim();
  const deviceType = String(body.deviceType || '').trim();
  const deviceName = String(body.deviceName || '').trim();
  const description = String(body.description || '').trim();
  const businessImpact = String(body.businessImpact || 'Moderate').trim();
  const priority = String(body.priority || 'Medium').trim();
  const issueTime = String(body.issueTime || new Date().toISOString()).trim();
  const serialNumber = String(body.serialNumber || '').trim();
  const assetId = body.assetId ? Number(body.assetId) : null;
  const locationId = body.locationId ? Number(body.locationId) : user.location_id;
  const departmentId = body.departmentId ? Number(body.departmentId) : user.department_id;

  if (!category || !deviceType || !description) {
    res.status(400).json({ error: 'Category, device type, and issue description are required' });
    return;
  }

  const validImpacts = ['Low', 'Moderate', 'High', 'Operations Halted'];
  const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
  if (!validImpacts.includes(businessImpact) || !validPriorities.includes(priority)) {
    res.status(400).json({ error: 'Invalid business impact or priority value' });
    return;
  }

  const loc = locationId
    ? (db.prepare('SELECT id, name, code, city, address FROM locations WHERE id = ?').get(locationId) as
        | { id: number; name: string; code: string; city: string; address: string }
        | undefined)
    : undefined;
  const dept = departmentId
    ? (db.prepare('SELECT id, name FROM departments WHERE id = ?').get(departmentId) as
        | { id: number; name: string }
        | undefined)
    : undefined;

  const ticketNumber = nextTicketNumber();
  const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(priority);

  const info = db
    .prepare(
      `INSERT INTO tickets (
        ticket_number, reporter_id, reporter_name, reporter_employee_code, reporter_department,
        reporter_designation, reporter_mobile, reporter_email, reporter_branch, reporter_city,
        reporter_full_location, reporter_reporting_manager, location_id, department_id,
        category, device_type, device_name, asset_id, serial_number, description, issue_time,
        business_impact, priority, status, first_response_due_at, resolution_due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?)`
    )
    .run(
      ticketNumber,
      user.id,
      String(body.reporterName || user.full_name),
      String(body.reporterEmployeeCode || user.employee_code || ''),
      String(body.reporterDepartment || dept?.name || ''),
      String(body.reporterDesignation || user.designation || ''),
      String(body.reporterMobile || user.mobile || ''),
      String(body.reporterEmail || user.email || ''),
      String(body.reporterBranch || loc?.name || ''),
      String(body.reporterCity || loc?.city || ''),
      String(body.reporterFullLocation || loc?.address || ''),
      String(body.reporterReportingManager || user.reporting_manager || ''),
      locationId || null,
      departmentId || null,
      category,
      deviceType,
      deviceName,
      assetId,
      serialNumber,
      description,
      issueTime,
      businessImpact,
      priority,
      firstResponseDueAt,
      resolutionDueAt
    );

  const ticketId = Number(info.lastInsertRowid);
  const files = (req.files as Express.Multer.File[]) || [];
  const insertAttachment = db.prepare(
    `INSERT INTO ticket_attachments (ticket_id, uploaded_by, file_name, stored_name, mime_type, file_size, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const file of files) {
    insertAttachment.run(
      ticketId,
      user.id,
      file.originalname,
      file.filename,
      file.mimetype,
      file.size,
      resolveMediaType(file.mimetype)
    );
  }

  logTicketActivity(
    ticketId,
    user.id,
    user.full_name,
    'TICKET_CREATED',
    `${ticketNumber} raised with ${priority} priority (${businessImpact} impact) and ${files.length} attachment(s).`
  );
  recordAudit(user, 'TICKET_CREATED', 'ticket', ticketId, `${ticketNumber} (${priority})`, getClientIp(req));

  notifyAdmins({
    type: priority === 'Critical' ? 'critical' : priority === 'High' ? 'warning' : 'info',
    title: `New ${priority} Ticket: ${ticketNumber}`,
    message: `${user.full_name} (${loc?.name || 'Operations'}): ${category} — ${deviceType}`,
    linkType: 'ticket',
    linkId: ticketId,
  });

  const created = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  res.status(201).json({ ticket: created });
});

// Full ticket detail
ticketsRouter.get('/tickets/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const user = req.user!;

  const ticket = db
    .prepare(
      `SELECT t.*,
              l.name as location_name, l.code as location_code, l.city as location_city,
              d.name as department_name, d.cost_center as department_cost_center,
              m.full_name as moderator_name, m.email as moderator_email, m.mobile as moderator_mobile,
              a.asset_tag as linked_asset_tag, a.brand as linked_asset_brand, a.model as linked_asset_model
       FROM tickets t
       LEFT JOIN locations l ON t.location_id = l.id
       LEFT JOIN departments d ON t.department_id = d.id
       LEFT JOIN users m ON t.assigned_moderator_id = m.id
       LEFT JOIN assets a ON t.asset_id = a.id
       WHERE t.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (user.role === 'employee' && ticket.reporter_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (user.role === 'moderator' && ticket.assigned_moderator_id !== user.id && ticket.reporter_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const attachments = db
    .prepare('SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at DESC')
    .all(id);
  const comments = db
    .prepare(
      `SELECT * FROM ticket_comments WHERE ticket_id = ? ${
        user.role === 'employee' ? 'AND is_internal = 0' : ''
      } ORDER BY created_at ASC`
    )
    .all(id);
  const assignments = db
    .prepare(
      `SELECT ta.*, m.full_name as moderator_name, ab.full_name as assigned_by_name
       FROM ticket_assignments ta
       LEFT JOIN users m ON ta.moderator_id = m.id
       LEFT JOIN users ab ON ta.assigned_by = ab.id
       WHERE ta.ticket_id = ? ORDER BY ta.created_at DESC`
    )
    .all(id);
  const timeLogs = db
    .prepare(
      `SELECT tl.*, u.full_name as moderator_name
       FROM ticket_time_logs tl
       LEFT JOIN users u ON tl.moderator_id = u.id
       WHERE tl.ticket_id = ? ORDER BY tl.started_at DESC`
    )
    .all(id);
  const activities = db
    .prepare('SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at DESC')
    .all(id);
  const maintenance = db
    .prepare(
      `SELECT am.*, v.name as vendor_name
       FROM asset_maintenance am
       LEFT JOIN vendors v ON am.vendor_id = v.id
       WHERE am.ticket_id = ? ORDER BY am.created_at DESC`
    )
    .all(id);

  res.json({
    ticket,
    attachments,
    comments,
    assignments,
    timeLogs,
    activities,
    maintenance,
  });
});

// Assign / reassign moderator (super_admin)
ticketsRouter.patch('/tickets/:id/assign', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const moderatorId = Number(req.body?.moderatorId);
  const deadline = req.body?.deadline ? String(req.body.deadline) : null;
  const reason = String(req.body?.reason || '').trim();

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  const mod = db
    .prepare("SELECT id, full_name, role, is_active FROM users WHERE id = ? AND role = 'moderator'")
    .get(moderatorId) as { id: number; full_name: string; is_active: number } | undefined;

  if (!ticket || !mod || !mod.is_active) {
    res.status(400).json({ error: 'Valid ticket and active moderator are required' });
    return;
  }

  const isReassign = Boolean(ticket.assigned_moderator_id);
  db.prepare(
    `UPDATE tickets
     SET assigned_moderator_id = ?, deadline = ?, assignment_reason = ?,
         status = 'Assigned', assigned_at = datetime('now'),
         first_responded_at = COALESCE(first_responded_at, datetime('now')),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(moderatorId, deadline, reason, id);

  db.prepare(
    `INSERT INTO ticket_assignments (ticket_id, moderator_id, assigned_by, reason, deadline, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, moderatorId, req.user!.id, reason, deadline, isReassign ? 'reassigned' : 'assigned');

  logTicketActivity(
    id,
    req.user!.id,
    req.user!.full_name,
    isReassign ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
    `Assigned to ${mod.full_name}${reason ? ` — Reason: ${reason}` : ''}`
  );
  recordAudit(req.user!, 'TICKET_ASSIGNED', 'ticket', id, `Assigned to ${mod.full_name}`, getClientIp(req));

  createAndPushNotification({
    userId: mod.id,
    type: 'info',
    title: `Ticket Assigned: ${ticket.ticket_number}`,
    message: `${req.user!.full_name} assigned ${ticket.priority} ticket to you.${reason ? ` Note: ${reason}` : ''}`,
    linkType: 'ticket',
    linkId: id,
  });

  res.json({ ok: true });
});

// Moderator accepts or rejects assignment
ticketsRouter.patch('/tickets/:id/respond', requireAuth, requireRole('moderator', 'super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.body?.action || '');
  const rejectionReason = String(req.body?.rejectionReason || '').trim();

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (req.user!.role === 'moderator' && ticket.assigned_moderator_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the assigned moderator can respond to this assignment' });
    return;
  }

  if (action === 'accept') {
    db.prepare(
      `UPDATE tickets
       SET status = 'Accepted', accepted_at = datetime('now'),
           first_responded_at = COALESCE(first_responded_at, datetime('now')),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(id);
    db.prepare(
      "UPDATE ticket_assignments SET status = 'accepted' WHERE id = (SELECT id FROM ticket_assignments WHERE ticket_id = ? ORDER BY id DESC LIMIT 1)"
    ).run(id);

    logTicketActivity(id, req.user!.id, req.user!.full_name, 'ASSIGNMENT_ACCEPTED', 'Moderator accepted the ticket assignment.');
    notifyAdmins({
      type: 'success',
      title: `Assignment Accepted: ${ticket.ticket_number}`,
      message: `${req.user!.full_name} accepted ${ticket.ticket_number}.`,
      linkType: 'ticket',
      linkId: id,
    });
  } else if (action === 'reject') {
    if (!rejectionReason) {
      res.status(400).json({ error: 'Rejection reason is required' });
      return;
    }
    db.prepare(
      `UPDATE tickets
       SET status = 'Rejected', rejection_reason = ?, assigned_moderator_id = NULL, updated_at = datetime('now')
       WHERE id = ?`
    ).run(rejectionReason, id);
    db.prepare(
      "UPDATE ticket_assignments SET status = 'rejected', rejection_reason = ? WHERE id = (SELECT id FROM ticket_assignments WHERE ticket_id = ? ORDER BY id DESC LIMIT 1)"
    ).run(rejectionReason, id);

    logTicketActivity(id, req.user!.id, req.user!.full_name, 'ASSIGNMENT_REJECTED', `Rejected: ${rejectionReason}`);
    notifyAdmins({
      type: 'warning',
      title: `Assignment Rejected: ${ticket.ticket_number}`,
      message: `${req.user!.full_name} rejected assignment: ${rejectionReason}`,
      linkType: 'ticket',
      linkId: id,
    });
  } else {
    res.status(400).json({ error: 'Invalid response action (accept or reject)' });
    return;
  }

  res.json({ ok: true });
});

// Status transitions (Under Review, In Progress, On Hold, Pending Information, Ready for Review, Revision Required, Resolved, Closed)
ticketsRouter.patch('/tickets/:id/status', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const id = Number(req.params.id);
  const nextStatus = String(req.body?.status || '').trim();
  const resolutionDescription = req.body?.resolutionDescription !== undefined ? String(req.body.resolutionDescription) : undefined;
  const note = String(req.body?.note || '').trim();
  const incrementVisit = Boolean(req.body?.incrementVisit);

  const allowed = [
    'Under Review',
    'In Progress',
    'On Hold',
    'Pending Information',
    'Ready for Review',
    'Revision Required',
    'Resolved',
    'Closed',
    'Completed',
  ];
  if (!allowed.includes(nextStatus)) {
    res.status(400).json({ error: 'Unsupported status transition' });
    return;
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (req.user!.role === 'moderator' && ticket.assigned_moderator_id !== req.user!.id) {
    res.status(403).json({ error: 'Access denied for unassigned ticket' });
    return;
  }

  const timestampUpdates: string[] = ["updated_at = datetime('now')"];
  if (nextStatus === 'Under Review') timestampUpdates.push("review_started_at = COALESCE(review_started_at, datetime('now'))");
  if (nextStatus === 'In Progress') timestampUpdates.push("work_started_at = COALESCE(work_started_at, datetime('now'))");
  if (nextStatus === 'Ready for Review') timestampUpdates.push("submitted_for_review_at = datetime('now')");
  if (nextStatus === 'Completed' || nextStatus === 'Resolved') timestampUpdates.push("completed_at = COALESCE(completed_at, datetime('now'))");
  if (nextStatus === 'Closed') timestampUpdates.push("closed_at = datetime('now')");
  if (incrementVisit) timestampUpdates.push('visit_count = visit_count + 1');

  const params: unknown[] = [nextStatus];
  let extraSql = '';
  if (resolutionDescription !== undefined) {
    extraSql = ', resolution_description = ?';
    params.push(resolutionDescription);
  }
  params.push(id);

  db.prepare(`UPDATE tickets SET status = ?${extraSql}, ${timestampUpdates.join(', ')} WHERE id = ?`).run(...params);

  logTicketActivity(
    id,
    req.user!.id,
    req.user!.full_name,
    'STATUS_CHANGED',
    `Moved from ${ticket.status} → ${nextStatus}${note ? ` (${note})` : ''}`
  );
  recordAudit(req.user!, 'TICKET_STATUS', 'ticket', id, `${ticket.ticket_number}: ${ticket.status} -> ${nextStatus}`, getClientIp(req));

  if (ticket.reporter_id && ticket.reporter_id !== req.user!.id) {
    createAndPushNotification({
      userId: Number(ticket.reporter_id),
      type: nextStatus === 'Ready for Review' ? 'success' : 'info',
      title: `Ticket Update: ${ticket.ticket_number}`,
      message: `Status changed to ${nextStatus}.${nextStatus === 'Ready for Review' ? ' Please confirm resolution.' : ''}`,
      linkType: 'ticket',
      linkId: id,
    });
  }

  if (nextStatus === 'Ready for Review') {
    notifyAdmins({
      type: 'info',
      title: `Ready for Review: ${ticket.ticket_number}`,
      message: `${req.user!.full_name} submitted ${ticket.ticket_number} for review.`,
      linkType: 'ticket',
      linkId: id,
    });
  }

  res.json({ ok: true });
});

// Start work timer
ticketsRouter.post('/tickets/:id/timer/start', requireAuth, requireRole('moderator', 'super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const workType = String(req.body?.workType || 'On-Site Repair').trim();
  const notes = String(req.body?.notes || '').trim();

  const active = db
    .prepare('SELECT id FROM ticket_time_logs WHERE ticket_id = ? AND moderator_id = ? AND ended_at IS NULL')
    .get(id, req.user!.id);
  if (active) {
    res.status(400).json({ error: 'A work timer is already running on this ticket' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO ticket_time_logs (ticket_id, moderator_id, work_type, notes, started_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, req.user!.id, workType, notes, new Date().toISOString());

  db.prepare(
    `UPDATE tickets
     SET status = CASE WHEN status IN ('Assigned', 'Accepted', 'Under Review', 'On Hold') THEN 'In Progress' ELSE status END,
         work_started_at = COALESCE(work_started_at, datetime('now')),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);

  logTicketActivity(id, req.user!.id, req.user!.full_name, 'TIMER_STARTED', `Started timer (${workType})`);
  res.status(201).json({ timerId: info.lastInsertRowid });
});

// Stop work timer
ticketsRouter.post('/tickets/:id/timer/stop', requireAuth, requireRole('moderator', 'super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : undefined;

  const active = db
    .prepare('SELECT * FROM ticket_time_logs WHERE ticket_id = ? AND moderator_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(id, req.user!.id) as { id: number; started_at: string; notes: string; work_type: string } | undefined;

  if (!active) {
    res.status(400).json({ error: 'No active timer found to stop' });
    return;
  }

  const endedAt = new Date();
  const startedAt = new Date(active.started_at);
  const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));

  db.prepare('UPDATE ticket_time_logs SET ended_at = ?, duration_minutes = ?, notes = ? WHERE id = ?').run(
    endedAt.toISOString(),
    durationMinutes,
    notes ?? active.notes,
    active.id
  );

  db.prepare('UPDATE tickets SET total_working_minutes = total_working_minutes + ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    durationMinutes,
    id
  );

  logTicketActivity(
    id,
    req.user!.id,
    req.user!.full_name,
    'TIMER_STOPPED',
    `Logged ${durationMinutes} min (${active.work_type})`
  );
  res.json({ durationMinutes });
});

// Add parts replaced / direct ticket expense
ticketsRouter.post('/tickets/:id/parts', requireAuth, requireRole('moderator', 'super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const partName = String(req.body?.partName || '').trim();
  const quantity = Math.max(1, Number(req.body?.quantity || 1));
  const cost = Math.max(0, Number(req.body?.cost || 0));
  const serial = String(req.body?.serial || '').trim();

  if (!partName) {
    res.status(400).json({ error: 'Part name is required' });
    return;
  }

  const ticket = db.prepare('SELECT parts_replaced, expenses_incurred FROM tickets WHERE id = ?').get(id) as
    | { parts_replaced: string; expenses_incurred: number }
    | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const list = JSON.parse(ticket.parts_replaced || '[]') as unknown[];
  list.push({
    partName,
    quantity,
    cost,
    serial,
    addedBy: req.user!.full_name,
    addedAt: new Date().toISOString(),
  });

  const totalCost = ticket.expenses_incurred + cost;
  db.prepare("UPDATE tickets SET parts_replaced = ?, expenses_incurred = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(list),
    totalCost,
    id
  );

  logTicketActivity(
    id,
    req.user!.id,
    req.user!.full_name,
    'PART_ADDED',
    `Added ${quantity}x ${partName} (INR ${cost.toFixed(2)})`
  );
  res.json({ parts: list, expensesIncurred: totalCost });
});

// Employee confirmation / reopen
ticketsRouter.patch('/tickets/:id/confirm', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const confirmed = Boolean(req.body?.confirmed);
  const feedback = String(req.body?.feedback || '').trim();
  const rating = req.body?.rating ? Math.min(5, Math.max(1, Number(req.body.rating))) : null;

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (req.user!.role === 'employee' && ticket.reporter_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the ticket reporter can confirm resolution' });
    return;
  }

  if (confirmed) {
    db.prepare(
      `UPDATE tickets
       SET employee_feedback = ?, employee_rating = ?, employee_confirmed_at = datetime('now'),
           status = 'Resolved', updated_at = datetime('now')
       WHERE id = ?`
    ).run(feedback, rating, id);
    logTicketActivity(
      id,
      req.user!.id,
      req.user!.full_name,
      'EMPLOYEE_CONFIRMED',
      `Employee confirmed resolution${rating ? ` (${rating}/5)` : ''}${feedback ? `: ${feedback}` : ''}`
    );
    notifyAdmins({
      type: 'success',
      title: `Employee Confirmed: ${ticket.ticket_number}`,
      message: `${req.user!.full_name} confirmed fix. Ready for final admin verification.`,
      linkType: 'ticket',
      linkId: id,
    });
  } else {
    db.prepare(
      `UPDATE tickets
       SET status = 'Revision Required', employee_feedback = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(feedback, id);
    logTicketActivity(id, req.user!.id, req.user!.full_name, 'REVISION_REQUESTED', feedback || 'Employee requested revision');
    if (ticket.assigned_moderator_id) {
      createAndPushNotification({
        userId: Number(ticket.assigned_moderator_id),
        type: 'warning',
        title: `Revision Requested: ${ticket.ticket_number}`,
        message: feedback || 'Employee reopened the ticket for further work.',
        linkType: 'ticket',
        linkId: id,
      });
    }
  }

  res.json({ ok: true });
});

// Admin final verification
ticketsRouter.patch('/tickets/:id/verify', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  db.prepare(
    `UPDATE tickets
     SET status = 'Completed', admin_verified_by = ?, admin_verified_at = datetime('now'),
         completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now')
     WHERE id = ?`
  ).run(req.user!.id, id);

  logTicketActivity(id, req.user!.id, req.user!.full_name, 'ADMIN_VERIFIED', 'IT Head verified and completed the ticket.');
  recordAudit(req.user!, 'TICKET_VERIFIED', 'ticket', id, `${ticket.ticket_number} verified as Completed`, getClientIp(req));
  res.json({ ok: true });
});

// Comments (Portal, Internal, Outlook, WhatsApp)
ticketsRouter.post('/tickets/:id/comments', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const body = String(req.body?.body || '').trim();
  const channel = String(req.body?.channel || 'portal');
  const isInternal = req.user!.role === 'employee' ? 0 : req.body?.isInternal ? 1 : 0;

  if (!body) {
    res.status(400).json({ error: 'Comment text is required' });
    return;
  }

  const validChannels = ['portal', 'outlook', 'whatsapp', 'internal'];
  const finalChannel = isInternal ? 'internal' : validChannels.includes(channel) ? channel : 'portal';

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO ticket_comments (ticket_id, user_id, author_name, author_role, channel, is_internal, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, req.user!.id, req.user!.full_name, req.user!.role, finalChannel, isInternal, body);

  logTicketActivity(
    id,
    req.user!.id,
    req.user!.full_name,
    isInternal ? 'INTERNAL_NOTE' : 'COMMENT_ADDED',
    `Posted via ${finalChannel}`
  );

  const comment = db.prepare('SELECT * FROM ticket_comments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

// Add extra attachments to existing ticket
ticketsRouter.post('/tickets/:id/attachments', requireAuth, upload.array('attachments', 12), (req, res) => {
  const id = Number(req.params.id);
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const insertAttachment = db.prepare(
    `INSERT INTO ticket_attachments (ticket_id, uploaded_by, file_name, stored_name, mime_type, file_size, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const file of files) {
    insertAttachment.run(
      id,
      req.user!.id,
      file.originalname,
      file.filename,
      file.mimetype,
      file.size,
      resolveMediaType(file.mimetype)
    );
  }
  logTicketActivity(id, req.user!.id, req.user!.full_name, 'ATTACHMENTS_ADDED', `Uploaded ${files.length} file(s)`);
  res.status(201).json({ count: files.length });
});

// Authenticated attachment serve endpoint
ticketsRouter.get('/attachments/:attachmentId', requireAuth, (req, res) => {
  const attachmentId = Number(req.params.attachmentId);
  const att = db
    .prepare(
      `SELECT ta.*, t.reporter_id, t.assigned_moderator_id
       FROM ticket_attachments ta
       JOIN tickets t ON ta.ticket_id = t.id
       WHERE ta.id = ?`
    )
    .get(attachmentId) as
    | {
        file_name: string;
        stored_name: string;
        mime_type: string;
        reporter_id: number | null;
        assigned_moderator_id: number | null;
      }
    | undefined;

  if (!att) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const user = req.user!;
  if (user.role === 'employee' && att.reporter_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, path.basename(att.stored_name));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File missing on disk' });
    return;
  }

  res.setHeader('Content-Type', att.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_name)}"`);
  res.sendFile(filePath);
});

// Bulk ticket operations (super_admin)
ticketsRouter.post('/tickets/bulk', requireAuth, requireRole('super_admin'), (req, res) => {
  const ticketIds = Array.isArray(req.body?.ticketIds) ? req.body.ticketIds.map(Number).filter(Boolean) : [];
  const action = String(req.body?.action || '');
  const value = req.body?.value;

  if (ticketIds.length === 0) {
    res.status(400).json({ error: 'Select at least one ticket' });
    return;
  }

  const placeholders = ticketIds.map(() => '?').join(',');
  if (action === 'status' && typeof value === 'string') {
    db.prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(
      value,
      ...ticketIds
    );
  } else if (action === 'priority' && typeof value === 'string') {
    db.prepare(`UPDATE tickets SET priority = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(
      value,
      ...ticketIds
    );
  } else if (action === 'assign' && Number(value)) {
    const modId = Number(value);
    db.prepare(
      `UPDATE tickets SET assigned_moderator_id = ?, status = 'Assigned', assigned_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${placeholders})`
    ).run(modId, ...ticketIds);
  } else {
    res.status(400).json({ error: 'Invalid bulk action' });
    return;
  }

  recordAudit(
    req.user!,
    'TICKETS_BULK_UPDATE',
    'ticket',
    ticketIds.join(','),
    `Bulk ${action} -> ${value}`,
    getClientIp(req)
  );
  res.json({ ok: true, count: ticketIds.length });
});
