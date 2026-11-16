import { IncomingMessage, Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { JWT_SECRET } from './config.ts';
import { db } from './db.ts';
import { UserRole } from './middleware.ts';

interface SocketClient {
  ws: WebSocket;
  userId: number;
  role: UserRole;
  fullName: string;
}

const clientsByUser = new Map<number, Set<SocketClient>>();
let wss: WebSocketServer | null = null;

export function getOnlineUserIds(): number[] {
  return Array.from(clientsByUser.keys());
}

export function sendToUser(userId: number, event: string, payload: unknown): void {
  const sockets = clientsByUser.get(userId);
  if (!sockets) return;
  const data = JSON.stringify({ event, payload });
  for (const client of sockets) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

export function broadcastToRoles(roles: UserRole[], event: string, payload: unknown): void {
  const data = JSON.stringify({ event, payload });
  for (const sockets of clientsByUser.values()) {
    for (const client of sockets) {
      if (roles.includes(client.role) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }
}

export function createAndPushNotification(params: {
  userId: number;
  type: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  linkType?: string;
  linkId?: string | number;
}): void {
  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, type, title, message, link_type, link_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.userId,
      params.type,
      params.title,
      params.message,
      params.linkType || '',
      params.linkId !== undefined ? String(params.linkId) : ''
    );

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);
  sendToUser(params.userId, 'notification:new', notification);
}

export function notifyAdmins(params: {
  type: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  linkType?: string;
  linkId?: string | number;
}): void {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'super_admin' AND is_active = 1").all() as {
    id: number;
  }[];
  for (const admin of admins) {
    createAndPushNotification({ ...params, userId: admin.id });
  }
}

function broadcastPresence(): void {
  const onlineIds = getOnlineUserIds();
  broadcastToRoles(['super_admin', 'moderator'], 'presence:update', { onlineUserIds: onlineIds });
}

export function attachWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; jti: string };
      const session = db
        .prepare('SELECT is_active FROM user_sessions WHERE token_jti = ? AND user_id = ?')
        .get(decoded.jti, decoded.userId) as { is_active: number } | undefined;

      if (!session || !session.is_active) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const user = db
        .prepare('SELECT id, role, full_name, is_active FROM users WHERE id = ?')
        .get(decoded.userId) as { id: number; role: UserRole; full_name: string; is_active: number } | undefined;

      if (!user || !user.is_active) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss!.handleUpgrade(req, socket, head, (ws) => {
        const client: SocketClient = {
          ws,
          userId: user.id,
          role: user.role,
          fullName: user.full_name,
        };
        wss!.emit('connection', ws, client);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, client: SocketClient) => {
    let userSet = clientsByUser.get(client.userId);
    if (!userSet) {
      userSet = new Set();
      clientsByUser.set(client.userId, userSet);
    }
    userSet.add(client);

    db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(client.userId);

    // Send initial state to newly connected socket
    ws.send(
      JSON.stringify({
        event: 'ws:ready',
        payload: {
          userId: client.userId,
          onlineUserIds: getOnlineUserIds(),
        },
      })
    );
    broadcastPresence();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string; payload?: Record<string, unknown> };
        if (msg.event === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', payload: { ts: Date.now() } }));
        } else if (msg.event === 'chat:typing' && msg.payload?.receiverId) {
          const receiverId = Number(msg.payload.receiverId);
          sendToUser(receiverId, 'chat:typing', { senderId: client.userId });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      const set = clientsByUser.get(client.userId);
      if (set) {
        set.delete(client);
        if (set.size === 0) {
          clientsByUser.delete(client.userId);
        }
      }
      db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(client.userId);
      broadcastPresence();
    });
  });
}
