import Database from 'better-sqlite3';
import path from 'path';
import { DATA_DIR } from './config.ts';

const dbPath = path.join(DATA_DIR, 'logicore.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      address TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      cost_center TEXT NOT NULL,
      head_name TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      mobile TEXT UNIQUE,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'moderator', 'employee', 'management')),
      employee_code TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      reporting_manager TEXT DEFAULT '',
      must_reset_password INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      specialization TEXT DEFAULT '',
      assigned_locations TEXT DEFAULT '[]',
      capacity INTEGER NOT NULL DEFAULT 10,
      rating REAL NOT NULL DEFAULT 5.0,
      mod_status TEXT NOT NULL DEFAULT 'available',
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS moderator_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('invite', 'common')),
      expires_at TEXT,
      used_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mobile TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_jti TEXT UNIQUE NOT NULL,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      login_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      logout_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT DEFAULT 'System',
      user_role TEXT DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sla_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priority TEXT UNIQUE NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
      first_response_minutes INTEGER NOT NULL,
      resolution_hours INTEGER NOT NULL,
      work_start_hour INTEGER NOT NULL DEFAULT 9,
      work_end_hour INTEGER NOT NULL DEFAULT 21,
      working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
      holidays TEXT NOT NULL DEFAULT '[]',
      auto_escalate INTEGER NOT NULL DEFAULT 1,
      escalation_email TEXT DEFAULT 'ithead@sdgloballogistics.com',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      contact_person TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      gstin TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      rating REAL NOT NULL DEFAULT 4.5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag TEXT UNIQUE NOT NULL,
      serial_number TEXT DEFAULT '',
      category TEXT NOT NULL,
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      purchase_date TEXT DEFAULT '',
      purchase_cost REAL NOT NULL DEFAULT 0,
      warranty_expiry TEXT DEFAULT '',
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      condition TEXT NOT NULL DEFAULT 'Operational' CHECK(condition IN ('Operational', 'Under Repair', 'Decommissioned', 'Spare')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asset_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      maintenance_type TEXT NOT NULL CHECK(maintenance_type IN ('Preventive', 'Repair', 'Parts Replacement')),
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      cost REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      performed_by TEXT DEFAULT '',
      maintenance_date TEXT NOT NULL,
      next_due_date TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reporter_name TEXT NOT NULL,
      reporter_employee_code TEXT DEFAULT '',
      reporter_department TEXT DEFAULT '',
      reporter_designation TEXT DEFAULT '',
      reporter_mobile TEXT DEFAULT '',
      reporter_email TEXT DEFAULT '',
      reporter_branch TEXT DEFAULT '',
      reporter_city TEXT DEFAULT '',
      reporter_full_location TEXT DEFAULT '',
      reporter_reporting_manager TEXT DEFAULT '',
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      device_type TEXT NOT NULL,
      device_name TEXT DEFAULT '',
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      serial_number TEXT DEFAULT '',
      description TEXT NOT NULL,
      issue_time TEXT NOT NULL,
      business_impact TEXT NOT NULL CHECK(business_impact IN ('Low', 'Moderate', 'High', 'Operations Halted')),
      priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
      status TEXT NOT NULL DEFAULT 'New',
      assigned_moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deadline TEXT,
      assignment_reason TEXT DEFAULT '',
      first_response_due_at TEXT,
      resolution_due_at TEXT,
      first_responded_at TEXT,
      sla_breached INTEGER NOT NULL DEFAULT 0,
      sla_breached_at TEXT,
      assigned_at TEXT,
      accepted_at TEXT,
      review_started_at TEXT,
      work_started_at TEXT,
      submitted_for_review_at TEXT,
      completed_at TEXT,
      closed_at TEXT,
      total_working_minutes INTEGER NOT NULL DEFAULT 0,
      visit_count INTEGER NOT NULL DEFAULT 0,
      parts_replaced TEXT NOT NULL DEFAULT '[]',
      expenses_incurred REAL NOT NULL DEFAULT 0,
      resolution_description TEXT DEFAULT '',
      employee_feedback TEXT DEFAULT '',
      employee_rating INTEGER,
      employee_confirmed_at TEXT,
      admin_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      admin_verified_at TEXT,
      rejection_reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('photo', 'video', 'document')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'portal' CHECK(channel IN ('portal', 'outlook', 'whatsapp', 'internal')),
      is_internal INTEGER NOT NULL DEFAULT 0,
      body TEXT NOT NULL,
      external_message_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT DEFAULT '',
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'assigned',
      rejection_reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      moderator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_type TEXT NOT NULL,
      notes TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      fiscal_year TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('annual', 'monthly')),
      month INTEGER,
      allocated_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      invoice_number TEXT DEFAULT '',
      invoice_file_name TEXT DEFAULT '',
      invoice_stored_name TEXT DEFAULT '',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      remarks TEXT DEFAULT '',
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dropdown_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'warning', 'critical', 'success')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_type TEXT DEFAULT '',
      link_id TEXT DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT UNIQUE NOT NULL CHECK(provider IN ('outlook', 'whatsapp')),
      is_connected INTEGER NOT NULL DEFAULT 0,
      account_email TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      refresh_token TEXT DEFAULT '',
      token_expires_at TEXT,
      last_sync_at TEXT,
      metadata_json TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outlook_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_preview TEXT NOT NULL,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      phone_number TEXT NOT NULL,
      template_name TEXT DEFAULT '',
      body TEXT NOT NULL,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_location ON tickets(location_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_moderator ON tickets(assigned_moderator_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(sender_id, receiver_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);
}
