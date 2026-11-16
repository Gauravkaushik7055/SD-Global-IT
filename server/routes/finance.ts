import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { INVOICES_DIR } from '../config.ts';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';
import { createAndPushNotification, notifyAdmins } from '../ws.ts';

export const financeRouter = Router();

const invoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, INVOICES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `inv-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const uploadInvoice = multer({ storage: invoiceStorage, limits: { fileSize: 15 * 1024 * 1024 } });

// Budgets
financeRouter.get('/budgets', requireAuth, requireRole('super_admin', 'management', 'moderator'), (req, res) => {
  const fiscalYear = String(req.query.fiscalYear || new Date().getFullYear());
  const budgets = db
    .prepare(
      `SELECT b.*, l.name as location_name, l.code as location_code,
              COALESCE((
                SELECT SUM(e.amount) FROM expenses e
                WHERE e.location_id = b.location_id
                  AND e.status = 'Approved'
                  AND strftime('%Y', e.expense_date) = b.fiscal_year
                  AND (b.period_type = 'annual' OR CAST(strftime('%m', e.expense_date) AS INTEGER) = b.month)
              ), 0) as actual_spent
       FROM budgets b
       JOIN locations l ON b.location_id = l.id
       WHERE b.fiscal_year = ?
       ORDER BY l.name ASC, b.period_type ASC, b.month ASC`
    )
    .all(fiscalYear);

  res.json({ budgets });
});

financeRouter.post('/budgets', requireAuth, requireRole('super_admin'), (req, res) => {
  const b = req.body || {};
  const locationId = Number(b.locationId);
  const fiscalYear = String(b.fiscalYear || new Date().getFullYear());
  const periodType = b.periodType === 'monthly' ? 'monthly' : 'annual';
  const month = periodType === 'monthly' ? Number(b.month) : null;
  const allocatedAmount = Number(b.allocatedAmount || 0);

  if (!locationId || allocatedAmount < 0 || (periodType === 'monthly' && (!month || month < 1 || month > 12))) {
    res.status(400).json({ error: 'Valid location, period, and allocated amount are required' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO budgets (location_id, fiscal_year, period_type, month, allocated_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(locationId, fiscalYear, periodType, month, allocatedAmount, String(b.notes || ''), req.user!.id);

  recordAudit(
    req.user!,
    'BUDGET_CREATED',
    'budget',
    info.lastInsertRowid,
    `Location #${locationId} ${fiscalYear} (${periodType}): INR ${allocatedAmount}`,
    getClientIp(req)
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

financeRouter.patch('/budgets/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const allocatedAmount = Number(req.body?.allocatedAmount);
  const notes = req.body?.notes !== undefined ? String(req.body.notes) : undefined;
  if (Number.isNaN(allocatedAmount) || allocatedAmount < 0) {
    res.status(400).json({ error: 'Valid allocated amount is required' });
    return;
  }

  db.prepare(
    `UPDATE budgets SET allocated_amount = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`
  ).run(allocatedAmount, notes ?? null, id);
  recordAudit(req.user!, 'BUDGET_UPDATED', 'budget', id, `Updated budget to INR ${allocatedAmount}`, getClientIp(req));
  res.json({ ok: true });
});

// Expenses
financeRouter.get('/expenses', requireAuth, requireRole('super_admin', 'management', 'moderator'), (req, res) => {
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (req.user!.role === 'moderator') {
    clauses.push('e.submitted_by = ?');
    params.push(req.user!.id);
  }
  if (locationId) {
    clauses.push('e.location_id = ?');
    params.push(locationId);
  }
  if (status && status !== 'all') {
    clauses.push('e.status = ?');
    params.push(status);
  }
  if (category && category !== 'all') {
    clauses.push('e.category = ?');
    params.push(category);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const expenses = db
    .prepare(
      `SELECT e.*,
              l.name as location_name, l.code as location_code,
              v.name as vendor_name,
              t.ticket_number,
              su.full_name as submitted_by_name,
              ru.full_name as reviewed_by_name
       FROM expenses e
       LEFT JOIN locations l ON e.location_id = l.id
       LEFT JOIN vendors v ON e.vendor_id = v.id
       LEFT JOIN tickets t ON e.ticket_id = t.id
       LEFT JOIN users su ON e.submitted_by = su.id
       LEFT JOIN users ru ON e.reviewed_by = ru.id
       ${whereSql}
       ORDER BY e.expense_date DESC, e.created_at DESC`
    )
    .all(...params);

  res.json({ expenses });
});

financeRouter.post(
  '/expenses',
  requireAuth,
  requireRole('super_admin', 'moderator'),
  uploadInvoice.single('invoice'),
  (req, res) => {
    const b = req.body || {};
    const locationId = Number(b.locationId);
    const category = String(b.category || '').trim();
    const amount = Number(b.amount);
    const expenseDate = String(b.expenseDate || new Date().toISOString().slice(0, 10));
    const description = String(b.description || '').trim();

    if (!locationId || !category || Number.isNaN(amount) || amount <= 0 || !description) {
      res.status(400).json({ error: 'Location, category, positive amount, and description are required' });
      return;
    }

    const file = req.file;
    const initialStatus = req.user!.role === 'super_admin' && b.autoApprove === 'true' ? 'Approved' : 'Pending';

    const info = db
      .prepare(
        `INSERT INTO expenses (
          location_id, ticket_id, vendor_id, category, amount, expense_date, invoice_number,
          invoice_file_name, invoice_stored_name, description, status, submitted_by,
          reviewed_by, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        locationId,
        b.ticketId ? Number(b.ticketId) : null,
        b.vendorId ? Number(b.vendorId) : null,
        category,
        amount,
        expenseDate,
        String(b.invoiceNumber || ''),
        file?.originalname || '',
        file?.filename || '',
        description,
        initialStatus,
        req.user!.id,
        initialStatus === 'Approved' ? req.user!.id : null,
        initialStatus === 'Approved' ? new Date().toISOString() : null
      );

    recordAudit(
      req.user!,
      'EXPENSE_SUBMITTED',
      'expense',
      info.lastInsertRowid,
      `${category} INR ${amount} (${initialStatus})`,
      getClientIp(req)
    );

    if (initialStatus === 'Pending') {
      notifyAdmins({
        type: 'info',
        title: 'Expense Approval Required',
        message: `${req.user!.full_name} submitted ${category} expense for INR ${amount.toLocaleString('en-IN')}.`,
        linkType: 'expense',
        linkId: info.lastInsertRowid as number,
      });
    }

    res.status(201).json({ id: info.lastInsertRowid });
  }
);

financeRouter.patch('/expenses/:id/review', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  const remarks = String(req.body?.remarks || '').trim();

  if (!['Approved', 'Rejected'].includes(status)) {
    res.status(400).json({ error: 'Status must be Approved or Rejected' });
    return;
  }

  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as
    | { id: number; submitted_by: number | null; amount: number; category: string }
    | undefined;
  if (!exp) {
    res.status(404).json({ error: 'Expense not found' });
    return;
  }

  db.prepare(
    `UPDATE expenses
     SET status = ?, remarks = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(status, remarks, req.user!.id, id);

  recordAudit(req.user!, 'EXPENSE_REVIEWED', 'expense', id, `${status}: ${remarks}`, getClientIp(req));

  if (exp.submitted_by && exp.submitted_by !== req.user!.id) {
    createAndPushNotification({
      userId: exp.submitted_by,
      type: status === 'Approved' ? 'success' : 'warning',
      title: `Expense ${status}`,
      message: `Your ${exp.category} expense (INR ${exp.amount}) was ${status.toLowerCase()}.${remarks ? ` Remarks: ${remarks}` : ''}`,
      linkType: 'expense',
      linkId: id,
    });
  }

  res.json({ ok: true });
});

financeRouter.get('/expenses/:id/invoice', requireAuth, requireRole('super_admin', 'management', 'moderator'), (req, res) => {
  const id = Number(req.params.id);
  const exp = db.prepare('SELECT invoice_file_name, invoice_stored_name FROM expenses WHERE id = ?').get(id) as
    | { invoice_file_name: string; invoice_stored_name: string }
    | undefined;
  if (!exp || !exp.invoice_stored_name) {
    res.status(404).json({ error: 'Invoice not attached' });
    return;
  }
  const filePath = path.join(INVOICES_DIR, path.basename(exp.invoice_stored_name));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Invoice file missing on disk' });
    return;
  }
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(exp.invoice_file_name)}"`);
  res.sendFile(filePath);
});

// Vendors CRUD
financeRouter.get('/vendors', requireAuth, (_req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name ASC').all();
  res.json({ vendors });
});

financeRouter.post('/vendors', requireAuth, requireRole('super_admin'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const category = String(b.category || '').trim();
  if (!name || !category) {
    res.status(400).json({ error: 'Vendor name and category are required' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO vendors (name, category, contact_person, email, phone, gstin, address, city, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      category,
      String(b.contactPerson || ''),
      String(b.email || ''),
      String(b.phone || ''),
      String(b.gstin || ''),
      String(b.address || ''),
      String(b.city || ''),
      Number(b.rating || 4.5)
    );
  recordAudit(req.user!, 'VENDOR_CREATED', 'vendor', info.lastInsertRowid, name, getClientIp(req));
  res.status(201).json({ id: info.lastInsertRowid });
});

financeRouter.patch('/vendors/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(
    `UPDATE vendors
     SET name = COALESCE(?, name),
         category = COALESCE(?, category),
         contact_person = COALESCE(?, contact_person),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         gstin = COALESCE(?, gstin),
         address = COALESCE(?, address),
         city = COALESCE(?, city),
         rating = COALESCE(?, rating),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    b.name ?? null,
    b.category ?? null,
    b.contactPerson ?? null,
    b.email ?? null,
    b.phone ?? null,
    b.gstin ?? null,
    b.address ?? null,
    b.city ?? null,
    b.rating !== undefined ? Number(b.rating) : null,
    b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
    id
  );
  recordAudit(req.user!, 'VENDOR_UPDATED', 'vendor', id, 'Updated vendor details', getClientIp(req));
  res.json({ ok: true });
});

financeRouter.delete('/vendors/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  recordAudit(req.user!, 'VENDOR_DELETED', 'vendor', id, 'Deleted vendor', getClientIp(req));
  res.json({ ok: true });
});
