import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const rawDataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
export const DATA_DIR = path.resolve(rawDataDir);
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const INVOICES_DIR = path.join(DATA_DIR, 'invoices');

for (const dir of [DATA_DIR, UPLOADS_DIR, INVOICES_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const secretFile = path.join(DATA_DIR, '.jwt_secret');
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

export const JWT_SECRET = resolveJwtSecret();
export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@SDGlobal2026';

export const OUTLOOK_CONFIG = {
  clientId: process.env.OUTLOOK_CLIENT_ID || '',
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
  tenantId: process.env.OUTLOOK_TENANT_ID || 'common',
};

export const WHATSAPP_CONFIG = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'sdglobal-whatsapp-verify-token',
};
