import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireRole } from '../middleware.ts';
import { getOnlineUserIds, sendToUser } from '../ws.ts';

export const realtimeRouter = Router();

// Chat contacts (Super Admin <-> Moderators)
realtimeRouter.get('/chat/contacts', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const user = req.user!;
  const targetRole = user.role === 'super_admin' ? 'moderator' : 'super_admin';
  const onlineIds = new Set(getOnlineUserIds());

  const contacts = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.specialization, u.mod_status, u.last_seen_at,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.sender_id = u.id AND cm.receiver_id = ? AND cm.is_read = 0) as unread_count,
              (SELECT cm.message FROM chat_messages cm WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) OR (cm.sender_id = ? AND cm.receiver_id = u.id) ORDER BY cm.id DESC LIMIT 1) as last_message,
              (SELECT cm.created_at FROM chat_messages cm WHERE (cm.sender_id = u.id AND cm.receiver_id = ?) OR (cm.sender_id = ? AND cm.receiver_id = u.id) ORDER BY cm.id DESC LIMIT 1) as last_message_at
       FROM users u
       WHERE u.role = ? AND u.is_active = 1
       ORDER BY last_message_at DESC, u.full_name ASC`
    )
    .all(user.id, user.id, user.id, user.id, user.id, targetRole) as Record<string, unknown>[];

  const enriched = contacts.map((c) => ({
    ...c,
    is_online: onlineIds.has(Number(c.id)),
  }));

  res.json({ contacts: enriched });
});

realtimeRouter.get('/chat/messages/:peerId', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const peerId = Number(req.params.peerId);
  const myId = req.user!.id;

  const messages = db
    .prepare(
      `SELECT * FROM chat_messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC LIMIT 200`
    )
    .all(myId, peerId, peerId, myId);

  db.prepare('UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0').run(
    peerId,
    myId
  );

  res.json({ messages });
});

realtimeRouter.post('/chat/messages/:peerId', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const peerId = Number(req.params.peerId);
  const message = String(req.body?.message || '').trim();
  if (!message) {
    res.status(400).json({ error: 'Message text cannot be empty' });
    return;
  }

  const peer = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(peerId) as
    | { id: number; role: string; is_active: number }
    | undefined;
  if (!peer || !peer.is_active) {
    res.status(404).json({ error: 'Recipient not found' });
    return;
  }

  const info = db
    .prepare('INSERT INTO chat_messages (sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, 0)')
    .run(req.user!.id, peerId, message);

  const saved = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  sendToUser(peerId, 'chat:message', saved);
  sendToUser(req.user!.id, 'chat:message', saved);

  res.status(201).json({ message: saved });
});

realtimeRouter.patch('/chat/read/:peerId', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const peerId = Number(req.params.peerId);
  db.prepare('UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0').run(
    peerId,
    req.user!.id
  );
  sendToUser(peerId, 'chat:read', { readerId: req.user!.id });
  res.json({ ok: true });
});

// Notifications
realtimeRouter.get('/notifications', requireAuth, (req, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60')
    .all(req.user!.id);
  const unreadCount = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as {
      c: number;
    }
  ).c;
  res.json({ notifications, unreadCount });
});

realtimeRouter.patch('/notifications/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  res.json({ ok: true });
});

realtimeRouter.patch('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});
