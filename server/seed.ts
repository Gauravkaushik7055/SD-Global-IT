import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { SUPER_ADMIN_PASSWORD } from './config.ts';
import { db } from './db.ts';

export function seedDatabase(): void {
  const tx = db.transaction(() => {
    // 1. Seed Roles
    const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
    if (roleCount === 0) {
      const insertRole = db.prepare('INSERT INTO roles (name, label, description) VALUES (?, ?, ?)');
      insertRole.run('super_admin', 'Super Admin (IT Head)', 'Full system governance, ticket assignment, approvals, budgets, SLA, and audit.');
      insertRole.run('moderator', 'IT Moderator (Technician)', 'Works assigned tickets, logs work timers, parts, expenses, and chats with IT Head.');
      insertRole.run('employee', 'Employee', 'Raises IT support tickets via mobile OTP and confirms resolution.');
      insertRole.run('management', 'Management', 'Read-only access to executive dashboards, budgets, SLA compliance, and reports.');
    }

    // 2. Seed 6 Indian Logistics Locations
    const locCount = (db.prepare('SELECT COUNT(*) as c FROM locations').get() as { c: number }).c;
    if (locCount === 0) {
      const insertLoc = db.prepare(
        'INSERT INTO locations (name, code, type, city, state, address, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      insertLoc.run(
        'Bhiwandi Mumbai Warehouse',
        'BWD-WH1',
        'warehouse',
        'Bhiwandi',
        'Maharashtra',
        'Plot 14, Mankoli Logistics Park, NH-3, Bhiwandi, Thane 421302',
        '+91 22 4890 1100'
      );
      insertLoc.run(
        'Gurugram Distribution Center',
        'GGN-DC1',
        'distribution_center',
        'Gurugram',
        'Haryana',
        'Sector 18, Tauru Freight Corridor, Gurugram 122015',
        '+91 124 412 2200'
      );
      insertLoc.run(
        'Bengaluru Cold-Chain Branch',
        'BLR-CC1',
        'branch',
        'Bengaluru',
        'Karnataka',
        'KIADB Industrial Area Phase II, Hoskote, Bengaluru 562114',
        '+91 80 4560 3300'
      );
      insertLoc.run(
        'Chennai Port Hub',
        'MAA-PH1',
        'port_hub',
        'Chennai',
        'Tamil Nadu',
        'Ennore Express Highway, Tiruvottiyur Port Zone, Chennai 600019',
        '+91 44 4320 4400'
      );
      insertLoc.run(
        'Pune Corporate HQ',
        'PNQ-HQ1',
        'corporate_hq',
        'Pune',
        'Maharashtra',
        'Tower B, Magarpatta Cybercity, Hadapsar, Pune 411013',
        '+91 20 6710 5500'
      );
      insertLoc.run(
        'Hyderabad Cargo Hub',
        'HYD-CH1',
        'cargo_hub',
        'Hyderabad',
        'Telangana',
        'Shamshabad Airport Logistics Park, RGIA Zone, Hyderabad 501218',
        '+91 40 4910 6600'
      );
    }

    // 3. Seed 6 Departments with Cost Centers
    const deptCount = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;
    if (deptCount === 0) {
      const insertDept = db.prepare(
        'INSERT INTO departments (name, code, cost_center, head_name) VALUES (?, ?, ?, ?)'
      );
      insertDept.run('Warehouse Operations', 'OPS-WH', 'CC-1010', 'Rajesh Kulkarni');
      insertDept.run('Fleet & Dispatch', 'FLT-DSP', 'CC-1020', 'Vikram Deshmukh');
      insertDept.run('Inventory Control', 'INV-CTL', 'CC-1030', 'Ananya Nair');
      insertDept.run('Finance & Billing', 'FIN-BIL', 'CC-1040', 'Suresh Iyer');
      insertDept.run('Human Resources', 'HR-OPS', 'CC-1050', 'Meera Joshi');
      insertDept.run('IT Infrastructure', 'IT-INF', 'CC-1060', 'IT Head');
    }

    // 4. Seed 4 SLA Configs
    const slaCount = (db.prepare('SELECT COUNT(*) as c FROM sla_configs').get() as { c: number }).c;
    if (slaCount === 0) {
      const insertSla = db.prepare(
        `INSERT INTO sla_configs (priority, first_response_minutes, resolution_hours, work_start_hour, work_end_hour, working_days, holidays, auto_escalate, escalation_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      insertSla.run('Critical', 15, 4, 0, 24, '[0,1,2,3,4,5,6]', '[]', 1, 'ithead@sdgloballogistics.com');
      insertSla.run('High', 30, 8, 8, 22, '[1,2,3,4,5,6]', '[]', 1, 'ithead@sdgloballogistics.com');
      insertSla.run('Medium', 240, 24, 9, 20, '[1,2,3,4,5,6]', '[]', 1, 'ithead@sdgloballogistics.com');
      insertSla.run('Low', 480, 48, 9, 18, '[1,2,3,4,5]', '[]', 0, 'ithead@sdgloballogistics.com');
    }

    // 5. Seed Sample Logistics IT Vendors
    const vendorCount = (db.prepare('SELECT COUNT(*) as c FROM vendors').get() as { c: number }).c;
    if (vendorCount === 0) {
      const insertVendor = db.prepare(
        'INSERT INTO vendors (name, category, contact_person, email, phone, gstin, address, city, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      insertVendor.run('Zebra AIDC Solutions India', 'Barcode & Thermal Printers', 'Karthik Rao', 'support@zebra-partner.in', '+91 98201 11223', '27AAACZ1234F1Z5', 'Andheri East Industrial Estate', 'Mumbai', 4.8);
      insertVendor.run('Cisco Enterprise NetSol', 'Networking & Switching', 'Pranav Mehta', 'noc@netsol-enterprise.in', '+91 98110 44556', '07AABCN8899K1Z2', 'Udyog Vihar Phase IV', 'Gurugram', 4.7);
      insertVendor.run('Hikvision Logistics Security', 'CCTV & NVR Systems', 'Senthil Kumar', 'care@hiksecurity.in', '+91 98400 77889', '33AAACH5566M1Z8', 'Guindy Industrial Estate', 'Chennai', 4.5);
      insertVendor.run('Dell ProSupport Enterprise', 'Laptops, Desktops & Servers', 'Neha Sharma', 'enterprise@dellpartner.in', '+91 99001 33445', '29AABCD7788L1Z1', 'Outer Ring Road Bellandur', 'Bengaluru', 4.9);
      insertVendor.run('APC Schneider PowerCare', 'UPS & Cold-Chain Power', 'Arjun Verma', 'service@powercare-india.in', '+91 97654 22110', '27AAACA9900P1Z4', 'Bhosari MIDC', 'Pune', 4.6);
    }

    // 6. Seed Dropdown Options
    const optCount = (db.prepare('SELECT COUNT(*) as c FROM dropdown_options').get() as { c: number }).c;
    if (optCount === 0) {
      const insertOpt = db.prepare(
        'INSERT INTO dropdown_options (list_key, label, value, sort_order) VALUES (?, ?, ?, ?)'
      );
      const lists: Record<string, string[]> = {
        ticket_categories: [
          'Hardware Failure',
          'Network & Wi-Fi',
          'Barcode / RFID Scanner',
          'Thermal Printer',
          'CCTV & Surveillance',
          'WMS / ERP Software',
          'Email & Access Control',
          'UPS & Power Backup',
        ],
        device_types: [
          'Laptop',
          'Desktop',
          'Thermal Label Printer',
          'Handheld Barcode Scanner',
          'CCTV Camera',
          'NVR / DVR Recorder',
          'Wi-Fi Access Point',
          'Network Switch / Router',
          'Rack Server',
          'UPS Unit',
          'Biometric Terminal',
        ],
        asset_categories: [
          'Laptop',
          'Desktop',
          'Printers',
          'CCTV Cameras',
          'Network Devices',
          'Barcode Scanners',
          'Servers',
          'UPS',
          'Routers',
          'Switches',
          'Other',
        ],
        expense_categories: [
          'Hardware Purchase',
          'Repair & Maintenance',
          'Software Subscription',
          'Networking',
          'Vendor Payment',
          'Spare Parts',
          'Emergency IT',
        ],
        work_types: [
          'Remote Diagnostics',
          'On-Site Repair',
          'Hardware Replacement',
          'Network Cabling',
          'Firmware / Software Patch',
          'Preventive Maintenance',
          'Vendor Escalation',
        ],
      };

      for (const [key, items] of Object.entries(lists)) {
        items.forEach((item, index) => {
          insertOpt.run(key, item, item, index + 1);
        });
      }
    }

    // 7. Seed Integration Config rows
    const intCount = (db.prepare('SELECT COUNT(*) as c FROM integration_configs').get() as { c: number }).c;
    if (intCount === 0) {
      db.prepare('INSERT INTO integration_configs (provider) VALUES (?)').run('outlook');
      db.prepare('INSERT INTO integration_configs (provider) VALUES (?)').run('whatsapp');
    }

    // 8. Seed Exactly ONE Super Admin user
    const superAdmin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get() as { id: number } | undefined;
    if (!superAdmin) {
      const hq = db.prepare("SELECT id FROM locations WHERE code = 'PNQ-HQ1' LIMIT 1").get() as { id: number } | undefined;
      const itDept = db.prepare("SELECT id FROM departments WHERE code = 'IT-INF' LIMIT 1").get() as { id: number } | undefined;
      const passwordHash = bcrypt.hashSync(SUPER_ADMIN_PASSWORD, 10);

      const info = db.prepare(`
        INSERT INTO users (
          email, mobile, password_hash, full_name, role, employee_code, designation,
          location_id, department_id, reporting_manager, must_reset_password, is_active
        ) VALUES (?, ?, ?, ?, 'super_admin', ?, ?, ?, ?, ?, 0, 1)
      `).run(
        'ithead@sdgloballogistics.com',
        '9800000001',
        passwordHash,
        'IT Head — SD Global Logistics',
        'SDG-IT-001',
        'Head of Enterprise IT',
        hq?.id ?? null,
        itDept?.id ?? null,
        'Chief Operating Officer'
      );

      // Seed initial common moderator access link
      const commonToken = crypto.randomBytes(24).toString('hex');
      db.prepare(`
        INSERT INTO moderator_invites (user_id, token, type, is_active, created_by)
        VALUES (NULL, ?, 'common', 1, ?)
      `).run(commonToken, info.lastInsertRowid);

      db.prepare(`
        INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details)
        VALUES (?, ?, 'super_admin', 'SEED_INIT', 'system', 'bootstrap', 'Initial LogiCore schema, locations, departments, SLA configs, vendors, and single super_admin seeded.')
      `).run(info.lastInsertRowid, 'IT Head — SD Global Logistics');
    }
  });

  tx();
}
