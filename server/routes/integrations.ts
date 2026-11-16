import { Router } from 'express';
import { APP_URL, OUTLOOK_CONFIG, WHATSAPP_CONFIG } from '../config.ts';
import { db } from '../db.ts';
import { getClientIp, recordAudit, requireAuth, requireRole } from '../middleware.ts';
import { notifyAdmins } from '../ws.ts';

export const integrationsRouter = Router();

function isOutlookConfigured(): boolean {
  return Boolean(OUTLOOK_CONFIG.clientId && OUTLOOK_CONFIG.clientSecret);
}

function isWhatsappConfigured(): boolean {
  return Boolean(WHATSAPP_CONFIG.accessToken && WHATSAPP_CONFIG.phoneNumberId);
}

integrationsRouter.get('/integrations/status', requireAuth, requireRole('super_admin', 'management'), (_req, res) => {
  const outlookRow = db.prepare("SELECT is_connected, account_email, last_sync_at FROM integration_configs WHERE provider = 'outlook'").get() as
    | { is_connected: number; account_email: string; last_sync_at: string | null }
    | undefined;
  const whatsappRow = db.prepare("SELECT is_connected, last_sync_at FROM integration_configs WHERE provider = 'whatsapp'").get() as
    | { is_connected: number; last_sync_at: string | null }
    | undefined;

  res.json({
    outlook: {
      configured: isOutlookConfigured(),
      connected: Boolean(outlookRow?.is_connected),
      accountEmail: outlookRow?.account_email || '',
      lastSyncAt: outlookRow?.last_sync_at || null,
      redirectUri: `${APP_URL}/api/integrations/outlook/callback`,
    },
    whatsapp: {
      configured: isWhatsappConfigured(),
      connected: isWhatsappConfigured() || Boolean(whatsappRow?.is_connected),
      webhookUrl: `${APP_URL}/api/webhooks/whatsapp`,
      verifyTokenConfigured: Boolean(WHATSAPP_CONFIG.verifyToken),
    },
  });
});

// Outlook Graph OAuth URL
integrationsRouter.get('/integrations/outlook/auth-url', requireAuth, requireRole('super_admin'), (_req, res) => {
  if (!isOutlookConfigured()) {
    res.status(400).json({
      configured: false,
      error: 'Microsoft Outlook credentials (OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET) are not configured in .env.',
    });
    return;
  }

  const redirectUri = `${APP_URL}/api/integrations/outlook/callback`;
  const scope = encodeURIComponent('offline_access User.Read Mail.Read Mail.Send');
  const authUrl = `https://login.microsoftonline.com/${OUTLOOK_CONFIG.tenantId}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(
    OUTLOOK_CONFIG.clientId
  )}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}`;

  res.json({ configured: true, authUrl });
});

integrationsRouter.get('/integrations/outlook/callback', async (req, res) => {
  const code = String(req.query.code || '');
  if (!code || !isOutlookConfigured()) {
    res.redirect('/?tab=integrations&outlook=error');
    return;
  }

  try {
    const redirectUri = `${APP_URL}/api/integrations/outlook/callback`;
    const body = new URLSearchParams({
      client_id: OUTLOOK_CONFIG.clientId,
      client_secret: OUTLOOK_CONFIG.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${OUTLOOK_CONFIG.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

    if (!tokenResp.ok) {
      res.redirect('/?tab=integrations&outlook=token_error');
      return;
    }

    const tokenJson = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const meJson = meResp.ok ? ((await meResp.json()) as { mail?: string; userPrincipalName?: string }) : {};
    const email = meJson.mail || meJson.userPrincipalName || '';
    const expiresAt = new Date(Date.now() + (tokenJson.expires_in || 3600) * 1000).toISOString();

    db.prepare(
      `UPDATE integration_configs
       SET is_connected = 1, account_email = ?, access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = datetime('now')
       WHERE provider = 'outlook'`
    ).run(email, tokenJson.access_token, tokenJson.refresh_token || '', expiresAt);

    res.redirect('/?tab=integrations&outlook=connected');
  } catch {
    res.redirect('/?tab=integrations&outlook=error');
  }
});

integrationsRouter.post('/integrations/outlook/disconnect', requireAuth, requireRole('super_admin'), (req, res) => {
  db.prepare(
    "UPDATE integration_configs SET is_connected = 0, access_token = '', refresh_token = '', account_email = '', updated_at = datetime('now') WHERE provider = 'outlook'"
  ).run();
  recordAudit(req.user!, 'OUTLOOK_DISCONNECTED', 'integration', 'outlook', 'Disconnected Outlook account', getClientIp(req));
  res.json({ ok: true });
});

integrationsRouter.get('/integrations/outlook/emails', requireAuth, requireRole('super_admin', 'moderator'), (_req, res) => {
  const emails = db
    .prepare(
      `SELECT oe.*, t.ticket_number
       FROM outlook_emails oe
       LEFT JOIN tickets t ON oe.ticket_id = t.id
       ORDER BY oe.received_at DESC LIMIT 100`
    )
    .all();
  res.json({ emails });
});

integrationsRouter.post('/integrations/outlook/sync', requireAuth, requireRole('super_admin'), async (req, res) => {
  const cfg = db.prepare("SELECT * FROM integration_configs WHERE provider = 'outlook'").get() as
    | { is_connected: number; access_token: string }
    | undefined;

  if (!isOutlookConfigured() || !cfg?.is_connected || !cfg.access_token) {
    res.status(400).json({
      configured: isOutlookConfigured(),
      error: isOutlookConfigured()
        ? 'Outlook account is not connected. Authorize via OAuth first.'
        : 'Outlook Graph credentials are not configured in .env.',
    });
    return;
  }

  try {
    const graphResp = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime',
      { headers: { Authorization: `Bearer ${cfg.access_token}` } }
    );
    if (!graphResp.ok) {
      res.status(502).json({ error: 'Microsoft Graph sync failed. Re-authenticate Outlook.' });
      return;
    }
    const data = (await graphResp.json()) as {
      value: Array<{
        id: string;
        subject?: string;
        bodyPreview?: string;
        from?: { emailAddress?: { address?: string } };
        toRecipients?: Array<{ emailAddress?: { address?: string } }>;
        receivedDateTime?: string;
      }>;
    };

    const insertEmail = db.prepare(
      `INSERT OR IGNORE INTO outlook_emails (external_id, direction, from_email, to_email, subject, body_preview, received_at)
       VALUES (?, 'inbound', ?, ?, ?, ?, ?)`
    );
    let synced = 0;
    for (const msg of data.value || []) {
      const info = insertEmail.run(
        msg.id,
        msg.from?.emailAddress?.address || '',
        msg.toRecipients?.[0]?.emailAddress?.address || '',
        msg.subject || '(No Subject)',
        msg.bodyPreview || '',
        msg.receivedDateTime || new Date().toISOString()
      );
      if (info.changes > 0) synced++;
    }

    db.prepare("UPDATE integration_configs SET last_sync_at = datetime('now') WHERE provider = 'outlook'").run();
    recordAudit(req.user!, 'OUTLOOK_SYNCED', 'integration', 'outlook', `Synced ${synced} messages`, getClientIp(req));
    res.json({ synced });
  } catch {
    res.status(500).json({ error: 'Failed to sync Outlook inbox' });
  }
});

integrationsRouter.post('/integrations/outlook/link', requireAuth, requireRole('super_admin', 'moderator'), (req, res) => {
  const emailId = Number(req.body?.emailId);
  const ticketId = Number(req.body?.ticketId);
  const email = db.prepare('SELECT * FROM outlook_emails WHERE id = ?').get(emailId) as
    | { id: number; subject: string; body_preview: string; from_email: string; external_id: string }
    | undefined;
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId);
  if (!email || !ticket) {
    res.status(404).json({ error: 'Email or ticket not found' });
    return;
  }

  db.prepare('UPDATE outlook_emails SET ticket_id = ? WHERE id = ?').run(ticketId, emailId);
  db.prepare(
    `INSERT INTO ticket_comments (ticket_id, user_id, author_name, author_role, channel, is_internal, body, external_message_id)
     VALUES (?, ?, ?, ?, 'outlook', 0, ?, ?)`
  ).run(
    ticketId,
    req.user!.id,
    email.from_email || req.user!.full_name,
    'outlook',
    `[Outlook: ${email.subject}]\n${email.body_preview}`,
    email.external_id || ''
  );

  res.json({ ok: true });
});

integrationsRouter.post('/integrations/outlook/send', requireAuth, requireRole('super_admin', 'moderator'), async (req, res) => {
  const toEmail = String(req.body?.toEmail || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const bodyText = String(req.body?.body || '').trim();
  const ticketId = req.body?.ticketId ? Number(req.body.ticketId) : null;

  if (!toEmail || !subject || !bodyText) {
    res.status(400).json({ error: 'Recipient email, subject, and message body are required' });
    return;
  }

  const cfg = db.prepare("SELECT * FROM integration_configs WHERE provider = 'outlook'").get() as
    | { is_connected: number; access_token: string; account_email: string }
    | undefined;

  if (!isOutlookConfigured() || !cfg?.is_connected || !cfg.access_token) {
    res.status(400).json({
      configured: isOutlookConfigured(),
      error: 'Outlook Graph OAuth is not configured or not connected.',
    });
    return;
  }

  const sendResp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: bodyText },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
    }),
  });

  if (!sendResp.ok) {
    res.status(502).json({ error: 'Microsoft Graph sendMail returned an error' });
    return;
  }

  db.prepare(
    `INSERT INTO outlook_emails (external_id, direction, from_email, to_email, subject, body_preview, ticket_id, received_at)
     VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?)`
  ).run(`out-${Date.now()}`, cfg.account_email, toEmail, subject, bodyText.slice(0, 400), ticketId, new Date().toISOString());

  if (ticketId) {
    db.prepare(
      `INSERT INTO ticket_comments (ticket_id, user_id, author_name, author_role, channel, is_internal, body)
       VALUES (?, ?, ?, ?, 'outlook', 0, ?)`
    ).run(ticketId, req.user!.id, req.user!.full_name, req.user!.role, `[Sent via Outlook to ${toEmail}] ${bodyText}`);
  }

  res.json({ ok: true });
});

// WhatsApp Business Cloud API
integrationsRouter.get('/integrations/whatsapp/messages', requireAuth, requireRole('super_admin', 'moderator'), (_req, res) => {
  const messages = db
    .prepare(
      `SELECT wm.*, t.ticket_number
       FROM whatsapp_messages wm
       LEFT JOIN tickets t ON wm.ticket_id = t.id
       ORDER BY wm.id DESC LIMIT 100`
    )
    .all();
  res.json({ messages });
});

integrationsRouter.post('/integrations/whatsapp/send', requireAuth, requireRole('super_admin', 'moderator'), async (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber || '').replace(/\D/g, '');
  const templateName = String(req.body?.templateName || 'ticket_update').trim();
  const body = String(req.body?.body || '').trim();
  const ticketId = req.body?.ticketId ? Number(req.body.ticketId) : null;

  if (!phoneNumber || (!templateName && !body)) {
    res.status(400).json({ error: 'Recipient phone number and message/template are required' });
    return;
  }

  if (!isWhatsappConfigured()) {
    res.status(400).json({
      configured: false,
      error: 'WhatsApp Cloud API credentials (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID) are not configured in .env.',
    });
    return;
  }

  const formattedPhone = phoneNumber.length === 10 ? `91${phoneNumber}` : phoneNumber;
  const payload = body
    ? {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { body },
      }
    : {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: { name: templateName, language: { code: 'en' } },
      };

  const resp = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_CONFIG.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_CONFIG.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    res.status(502).json({ error: 'Meta WhatsApp Cloud API rejected the request' });
    return;
  }

  const data = (await resp.json()) as { messages?: Array<{ id?: string }> };
  const extId = data.messages?.[0]?.id || `wa-${Date.now()}`;

  db.prepare(
    `INSERT INTO whatsapp_messages (external_id, direction, phone_number, template_name, body, ticket_id, status)
     VALUES (?, 'outbound', ?, ?, ?, ?, 'sent')`
  ).run(extId, formattedPhone, templateName, body || `[Template: ${templateName}]`, ticketId);

  if (ticketId) {
    db.prepare(
      `INSERT INTO ticket_comments (ticket_id, user_id, author_name, author_role, channel, is_internal, body, external_message_id)
       VALUES (?, ?, ?, ?, 'whatsapp', 0, ?, ?)`
    ).run(ticketId, req.user!.id, req.user!.full_name, req.user!.role, body || `[WhatsApp Template: ${templateName}]`, extId);
  }

  res.json({ ok: true, externalId: extId });
});

// Meta WhatsApp Webhook Verification (GET) & Inbound Receiver (POST)
integrationsRouter.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_CONFIG.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Forbidden');
});

integrationsRouter.post('/webhooks/whatsapp', (req, res) => {
  const entry = req.body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const messages = Array.isArray(change?.messages) ? change.messages : [];

  for (const msg of messages) {
    const fromPhone = String(msg.from || '');
    const textBody = String(msg.text?.body || msg.type || 'Media message');
    const extId = String(msg.id || `wa-in-${Date.now()}`);

    // Try linking to most recent open ticket for that mobile
    const last10 = fromPhone.slice(-10);
    const matchedTicket = db
      .prepare(
        `SELECT id, ticket_number FROM tickets
         WHERE reporter_mobile LIKE ? AND status NOT IN ('Completed', 'Closed')
         ORDER BY id DESC LIMIT 1`
      )
      .get(`%${last10}`) as { id: number; ticket_number: string } | undefined;

    db.prepare(
      `INSERT INTO whatsapp_messages (external_id, direction, phone_number, template_name, body, ticket_id, status)
       VALUES (?, 'inbound', ?, '', ?, ?, 'received')`
    ).run(extId, fromPhone, textBody, matchedTicket?.id ?? null);

    if (matchedTicket) {
      db.prepare(
        `INSERT INTO ticket_comments (ticket_id, user_id, author_name, author_role, channel, is_internal, body, external_message_id)
         VALUES (?, NULL, ?, 'employee', 'whatsapp', 0, ?, ?)`
      ).run(matchedTicket.id, fromPhone, textBody, extId);
    }

    notifyAdmins({
      type: 'info',
      title: 'Inbound WhatsApp Message',
      message: `${fromPhone}: ${textBody.slice(0, 80)}`,
      linkType: matchedTicket ? 'ticket' : 'integrations',
      linkId: matchedTicket?.id ?? 'whatsapp',
    });
  }

  res.sendStatus(200);
});
