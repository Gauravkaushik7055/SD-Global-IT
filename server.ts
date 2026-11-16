import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { DATA_DIR, PORT } from './server/config.ts';
import { db, initSchema } from './server/db.ts';
import { adminRouter } from './server/routes/admin.ts';
import { assetsRouter } from './server/routes/assets.ts';
import { authRouter } from './server/routes/auth.ts';
import { financeRouter } from './server/routes/finance.ts';
import { integrationsRouter } from './server/routes/integrations.ts';
import { realtimeRouter } from './server/routes/realtime.ts';
import { ticketsRouter } from './server/routes/tickets.ts';
import { usersRouter } from './server/routes/users.ts';
import { seedDatabase } from './server/seed.ts';
import { startSlaEngine } from './server/slaEngine.ts';
import { attachWebSocketServer } from './server/ws.ts';

async function bootstrap() {
  initSchema();
  seedDatabase();
  startSlaEngine();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        service: 'LogiCore IT Support CRM',
        dataDir: DATA_DIR,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: String(err) });
    }
  });

  app.use('/api', authRouter);
  app.use('/api', ticketsRouter);
  app.use('/api', usersRouter);
  app.use('/api', assetsRouter);
  app.use('/api', financeRouter);
  app.use('/api', adminRouter);
  app.use('/api', realtimeRouter);
  app.use('/api', integrationsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  const server = http.createServer(app);
  attachWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LogiCore IT Support CRM running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start LogiCore server:', err);
  process.exit(1);
});
