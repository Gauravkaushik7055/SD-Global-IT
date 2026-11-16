import { Router } from 'express';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';

export const assetsRouter = Router();

assetsRouter.get('/assets', requireAuth, (req, res) => {
  const search = String(req.query.search || '').trim();
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const category = String(req.query.category || '').trim();
  const condition = String(req.query.condition || '').trim();

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (search) {
    clauses.push('(a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.brand LIKE ? OR a.model LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat, pat);
  }
  if (locationId) {
    clauses.push('a.location_id = ?');
    params.push(locationId);
  }
  if (category && category !== 'all') {
    clauses.push('a.category = ?');
    params.push(category);
  }
  if (condition && condition !== 'all') {
    clauses.push('a.condition = ?');
    params.push(condition);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const assets = db
    .prepare(
      `SELECT a.*,
              l.name as location_name, l.code as location_code,
              u.full_name as assigned_user_name, u.employee_code as assigned_user_code,
              (SELECT COUNT(*) FROM asset_maintenance am WHERE am.asset_id = a.id) as maintenance_count,
              (SELECT COALESCE(SUM(cost), 0) FROM asset_maintenance am WHERE am.asset_id = a.id) as total_maintenance_cost
       FROM assets a
       LEFT JOIN locations l ON a.location_id = l.id
       LEFT JOIN users u ON a.assigned_user_id = u.id
       ${whereSql}
       ORDER BY a.created_at DESC`
    )
    .all(...params);

  res.json({ assets });
});

assetsRouter.post('/assets', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const b = req.body || {};
  const assetTag = String(b.assetTag || '').trim();
  const category = String(b.category || '').trim();
  if (!assetTag || !category) {
    res.status(400).json({ error: 'Asset tag and category are required' });
    return;
  }

  const dup = db.prepare('SELECT id FROM assets WHERE asset_tag = ?').get(assetTag);
  if (dup) {
    res.status(409).json({ error: 'An asset with this tag already exists' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO assets (
        asset_tag, serial_number, category, brand, model, purchase_date, purchase_cost,
        warranty_expiry, assigned_user_id, location_id, condition, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      assetTag,
      String(b.serialNumber || ''),
      category,
      String(b.brand || ''),
      String(b.model || ''),
      String(b.purchaseDate || ''),
      Number(b.purchaseCost || 0),
      String(b.warrantyExpiry || ''),
      b.assignedUserId ? Number(b.assignedUserId) : null,
      b.locationId ? Number(b.locationId) : null,
      String(b.condition || 'Operational'),
      String(b.notes || '')
    );

  recordAudit(req.user!, 'ASSET_CREATED', 'asset', info.lastInsertRowid, `${assetTag} (${category})`, getClientIp(req));
  const created = db.prepare('SELECT * FROM assets WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ asset: created });
});

assetsRouter.patch('/assets/:id', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare('SELECT id, asset_tag FROM assets WHERE id = ?').get(id) as { id: number; asset_tag: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  db.prepare(
    `UPDATE assets
     SET serial_number = COALESCE(?, serial_number),
         category = COALESCE(?, category),
         brand = COALESCE(?, brand),
         model = COALESCE(?, model),
         purchase_date = COALESCE(?, purchase_date),
         purchase_cost = COALESCE(?, purchase_cost),
         warranty_expiry = COALESCE(?, warranty_expiry),
         assigned_user_id = ?,
         location_id = ?,
         condition = COALESCE(?, condition),
         notes = COALESCE(?, notes),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.serialNumber ?? null,
    b.category ?? null,
    b.brand ?? null,
    b.model ?? null,
    b.purchaseDate ?? null,
    b.purchaseCost !== undefined ? Number(b.purchaseCost) : null,
    b.warrantyExpiry ?? null,
    b.assignedUserId !== undefined ? (b.assignedUserId ? Number(b.assignedUserId) : null) : null,
    b.locationId !== undefined ? (b.locationId ? Number(b.locationId) : null) : null,
    b.condition ?? null,
    b.notes ?? null,
    id
  );

  recordAudit(req.user!, 'ASSET_UPDATED', 'asset', id, `Updated ${existing.asset_tag}`, getClientIp(req));
  res.json({ ok: true });
});

assetsRouter.delete('/assets/:id', requireAuth, requireRole('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  recordAudit(req.user!, 'ASSET_DELETED', 'asset', id, 'Deleted asset record', getClientIp(req));
  res.json({ ok: true });
});

assetsRouter.get('/assets/:id/maintenance', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const logs = db
    .prepare(
      `SELECT am.*, v.name as vendor_name, t.ticket_number
       FROM asset_maintenance am
       LEFT JOIN vendors v ON am.vendor_id = v.id
       LEFT JOIN tickets t ON am.ticket_id = t.id
       WHERE am.asset_id = ?
       ORDER BY am.maintenance_date DESC, am.created_at DESC`
    )
    .all(id);
  res.json({ maintenance: logs });
});

assetsRouter.post('/assets/:id/maintenance', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const assetId = Number(req.params.id);
  const b = req.body || {};
  const maintenanceType = String(b.maintenanceType || 'Repair');
  const description = String(b.description || '').trim();
  const maintenanceDate = String(b.maintenanceDate || new Date().toISOString().slice(0, 10));

  if (!description) {
    res.status(400).json({ error: 'Maintenance description is required' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO asset_maintenance (
        asset_id, ticket_id, maintenance_type, vendor_id, cost, description, performed_by, maintenance_date, next_due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      assetId,
      b.ticketId ? Number(b.ticketId) : null,
      maintenanceType,
      b.vendorId ? Number(b.vendorId) : null,
      Number(b.cost || 0),
      description,
      String(b.performedBy || req.user!.full_name),
      maintenanceDate,
      String(b.nextDueDate || '')
    );

  recordAudit(req.user!, 'ASSET_MAINTENANCE_LOGGED', 'asset', assetId, `${maintenanceType}: ${description}`, getClientIp(req));
  const row = db.prepare('SELECT * FROM asset_maintenance WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ maintenance: row });
});
