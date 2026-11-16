# SD Global IT Support CRM — SD Global Logistics

Enterprise IT helpdesk, asset inventory, budget & expense approval, and SLA governance platform built for SD Global Logistics across warehouses, distribution centers, cold-chain branches, port hubs, and corporate offices.

## Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts, jsPDF + AutoTable, SheetJS (`xlsx`).
- **Backend**: Node.js, Express, TypeScript (`tsx`), `better-sqlite3` (SQLite in WAL mode), `ws` WebSockets, JWT (`jsonwebtoken`), `bcryptjs`, `multer`.
- **Single Server**: Express serves `/api/*`, `/ws`, and either Vite middleware (development) or built static assets from `dist/` (production) on `PORT` (default `3000`).
- **Health Endpoint**: `GET /api/health`

## Initial Seeded Data

On first boot, the server initializes the SQLite schema in `$DATA_DIR/logicore.db` and seeds:
- **4 Roles**: `super_admin`, `moderator`, `employee`, `management`
- **6 Indian Logistics Locations**: Bhiwandi Mumbai Warehouse (`BWD-WH1`), Gurugram Distribution Center (`GGN-DC1`), Bengaluru Cold-Chain Branch (`BLR-CC1`), Chennai Port Hub (`MAA-PH1`), Pune Corporate HQ (`PNQ-HQ1`), Hyderabad Cargo Hub (`HYD-CH1`)
- **6 Departments & Cost Centers**: Warehouse Operations, Fleet & Dispatch, Inventory Control, Finance & Billing, Human Resources, IT Infrastructure
- **4 SLA Policies**: Critical (`15m / 4h`), High (`30m / 8h`), Medium (`4h / 24h`), Low (`8h / 48h`)
- **Sample Logistics IT Vendors** and **Dynamic Dropdown Lists**
- **1 Super Admin Account**:
  - **Email**: `ithead@sdgloballogistics.com`
  - **Password**: `process.env.SUPER_ADMIN_PASSWORD` (default: `Admin@SDGlobal2026`)

Employees can sign in immediately with any 10-digit mobile number via OTP without pre-registration. Moderators and Management users are provisioned by the Super Admin.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build & Run

```bash
npm run build
npm run start
```

## Docker Deployment

```bash
docker build -t logicore-it-crm .
docker run -d \
  --name logicore-crm \
  -p 3000:3000 \
  -v logicore_data:/data \
  -e JWT_SECRET="replace-with-strong-secret" \
  -e APP_URL="https://support.sdgloballogistics.com" \
  -e SUPER_ADMIN_PASSWORD="your-admin-password" \
  logicore-it-crm
```

## Optional Integrations (.env)

- **Microsoft Outlook (Graph OAuth)**: Set `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, and `OUTLOOK_TENANT_ID`.
- **Meta WhatsApp Cloud API**: Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_VERIFY_TOKEN` (webhook endpoint: `/api/webhooks/whatsapp`).
