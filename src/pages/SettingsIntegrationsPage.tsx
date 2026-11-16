import { AlertCircle, CheckCircle2, Mail, MessageSquare, RefreshCw, ShieldAlert } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { SlaConfig, Ticket } from '../types.ts';

export function SettingsIntegrationsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'sla' | 'outlook' | 'whatsapp'>('sla');

  // SLA state
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([]);

  // Integrations status
  const [status, setStatus] = useState<{
    outlook: { configured: boolean; connected: boolean; accountEmail: string; lastSyncAt: string | null; redirectUri: string };
    whatsapp: { configured: boolean; connected: boolean; webhookUrl: string; verifyTokenConfigured: boolean };
  } | null>(null);

  const [outlookEmails, setOutlookEmails] = useState<
    Array<{ id: number; direction: string; from_email: string; to_email: string; subject: string; ticket_number: string | null; received_at: string }>
  >([]);
  const [waMessages, setWaMessages] = useState<
    Array<{ id: number; direction: string; phone_number: string; template_name: string; body: string; ticket_number: string | null; status: string; created_at: string }>
  >([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [linkTicketMap, setLinkTicketMap] = useState<Record<number, string>>({});
  const [waPhone, setWaPhone] = useState('');
  const [waTemplate, setWaTemplate] = useState('ticket_update');
  const [waBody, setWaBody] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [sRes, iRes, eRes, wRes, tRes] = await Promise.all([
        apiFetch<{ configs: SlaConfig[] }>('/api/sla-configs'),
        apiFetch<NonNullable<typeof status>>('/api/integrations/status'),
        apiFetch<{ emails: typeof outlookEmails }>('/api/integrations/outlook/emails'),
        apiFetch<{ messages: typeof waMessages }>('/api/integrations/whatsapp/messages'),
        apiFetch<{ tickets: Ticket[] }>('/api/tickets'),
      ]);
      setSlaConfigs(sRes.configs);
      setStatus(iRes);
      setOutlookEmails(eRes.emails);
      setWaMessages(wRes.messages);
      setTickets(tRes.tickets);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveSla = async (cfg: SlaConfig) => {
    try {
      await apiFetch(`/api/sla-configs/${cfg.priority}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstResponseMinutes: Number(cfg.first_response_minutes),
          resolutionHours: Number(cfg.resolution_hours),
          workStartHour: Number(cfg.work_start_hour),
          workEndHour: Number(cfg.work_end_hour),
          autoEscalate: Boolean(cfg.auto_escalate),
          escalationEmail: cfg.escalation_email,
        }),
      });
      showToast(`${cfg.priority} SLA configuration updated`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleConnectOutlook = async () => {
    try {
      const res = await apiFetch<{ authUrl: string }>('/api/integrations/outlook/auth-url');
      window.location.href = res.authUrl;
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSyncOutlook = async () => {
    try {
      const res = await apiFetch<{ synced: number }>('/api/integrations/outlook/sync', { method: 'POST' });
      showToast(`Synced ${res.synced} Outlook messages`, 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleLinkEmail = async (emailId: number) => {
    const ticketId = linkTicketMap[emailId];
    if (!ticketId) return;
    try {
      await apiFetch('/api/integrations/outlook/link', {
        method: 'POST',
        body: JSON.stringify({ emailId, ticketId: Number(ticketId) }),
      });
      showToast('Email linked to ticket thread', 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/integrations/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: waPhone, templateName: waTemplate, body: waBody }),
      });
      showToast('WhatsApp message dispatched', 'success');
      setWaBody('');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">SLA Engine & Integrations</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure SLA escalation thresholds, Microsoft Outlook Graph OAuth, and Meta WhatsApp Cloud API.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {[
          { id: 'sla', label: 'SLA Rules', icon: ShieldAlert },
          { id: 'outlook', label: 'Microsoft Outlook', icon: Mail },
          { id: 'whatsapp', label: 'WhatsApp Business', icon: MessageSquare },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'sla' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slaConfigs.map((cfg) => (
            <div
              key={cfg.priority}
              className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold">{cfg.priority} Priority SLA</h2>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(cfg.auto_escalate)}
                    onChange={(e) =>
                      setSlaConfigs((prev) =>
                        prev.map((x) =>
                          x.priority === cfg.priority ? { ...x, auto_escalate: e.target.checked ? 1 : 0 } : x
                        )
                      )
                    }
                  />
                  Auto-Escalate
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">First Response (min)</label>
                  <input
                    type="number"
                    min="1"
                    value={cfg.first_response_minutes}
                    onChange={(e) =>
                      setSlaConfigs((prev) =>
                        prev.map((x) =>
                          x.priority === cfg.priority ? { ...x, first_response_minutes: Number(e.target.value) } : x
                        )
                      )
                    }
                    className="w-full px-3 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Resolution Target (hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={cfg.resolution_hours}
                    onChange={(e) =>
                      setSlaConfigs((prev) =>
                        prev.map((x) =>
                          x.priority === cfg.priority ? { ...x, resolution_hours: Number(e.target.value) } : x
                        )
                      )
                    }
                    className="w-full px-3 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Work Start Hour (0-23)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={cfg.work_start_hour}
                    onChange={(e) =>
                      setSlaConfigs((prev) =>
                        prev.map((x) =>
                          x.priority === cfg.priority ? { ...x, work_start_hour: Number(e.target.value) } : x
                        )
                      )
                    }
                    className="w-full px-3 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Work End Hour (1-24)</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={cfg.work_end_hour}
                    onChange={(e) =>
                      setSlaConfigs((prev) =>
                        prev.map((x) =>
                          x.priority === cfg.priority ? { ...x, work_end_hour: Number(e.target.value) } : x
                        )
                      )
                    }
                    className="w-full px-3 py-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="email"
                  value={cfg.escalation_email}
                  onChange={(e) =>
                    setSlaConfigs((prev) =>
                      prev.map((x) => (x.priority === cfg.priority ? { ...x, escalation_email: e.target.value } : x))
                    )
                  }
                  placeholder="Escalation email"
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => handleSaveSla(cfg)}
                  className="px-3.5 py-1.5 rounded bg-blue-700 text-white text-xs font-semibold"
                >
                  Save Rule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'outlook' && status && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold">
                {status.outlook.configured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>
                  Microsoft Outlook (Graph API):{' '}
                  {!status.outlook.configured
                    ? 'Not Configured'
                    : status.outlook.connected
                    ? `Connected (${status.outlook.accountEmail})`
                    : 'Ready to Authorize'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {status.outlook.configured
                  ? `Callback URI: ${status.outlook.redirectUri}`
                  : 'Set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, and OUTLOOK_TENANT_ID in .env to enable OAuth mail sync.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!status.outlook.configured}
                onClick={handleConnectOutlook}
                className="px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                {status.outlook.connected ? 'Reconnect OAuth' : 'Connect Outlook'}
              </button>
              <button
                type="button"
                disabled={!status.outlook.connected}
                onClick={handleSyncOutlook}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sync Inbox
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
              Synced & Dispatched Outlook Emails
            </div>
            {outlookEmails.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No Outlook email threads synced yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Direction</th>
                    <th className="text-left px-4 py-2">From / To</th>
                    <th className="text-left px-4 py-2">Subject</th>
                    <th className="text-right px-4 py-2">Link Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {outlookEmails.map((em) => (
                    <tr key={em.id}>
                      <td className="px-4 py-2 uppercase font-mono">{em.direction}</td>
                      <td className="px-4 py-2">{em.direction === 'inbound' ? em.from_email : em.to_email}</td>
                      <td className="px-4 py-2 font-medium">{em.subject}</td>
                      <td className="px-4 py-2 text-right">
                        {em.ticket_number ? (
                          <span className="font-mono text-blue-600">{em.ticket_number}</span>
                        ) : (
                          <div className="inline-flex gap-1">
                            <select
                              value={linkTicketMap[em.id] || ''}
                              onChange={(e) => setLinkTicketMap((p) => ({ ...p, [em.id]: e.target.value }))}
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            >
                              <option value="">Ticket...</option>
                              {tickets.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.ticket_number}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleLinkEmail(em.id)}
                              className="px-2 py-1 rounded bg-slate-900 text-white text-xs"
                            >
                              Link
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'whatsapp' && status && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              {status.whatsapp.configured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                Meta WhatsApp Cloud API: {status.whatsapp.configured ? 'Configured & Active' : 'Not Configured'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {status.whatsapp.configured
                ? 'Outbound template dispatch and webhook ingestion are active.'
                : 'Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN in .env.'}
            </p>
            <div className="text-xs font-mono bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded border border-slate-200 dark:border-slate-800">
              Webhook Endpoint: {status.whatsapp.webhookUrl}
            </div>
          </div>

          <form
            onSubmit={handleSendWhatsApp}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <input
              type="tel"
              required
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              placeholder="Recipient Mobile (e.g. 9876543210)"
              className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={waTemplate}
              onChange={(e) => setWaTemplate(e.target.value)}
              placeholder="Template Name"
              className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={waBody}
              onChange={(e) => setWaBody(e.target.value)}
              placeholder="Optional text body"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={!status.whatsapp.configured}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
            >
              Send WhatsApp
            </button>
          </form>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
              WhatsApp Webhook & Dispatch Log
            </div>
            {waMessages.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No WhatsApp messages logged yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Direction</th>
                    <th className="text-left px-4 py-2">Phone</th>
                    <th className="text-left px-4 py-2">Message</th>
                    <th className="text-left px-4 py-2">Ticket</th>
                    <th className="text-right px-4 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {waMessages.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 uppercase font-mono">{m.direction}</td>
                      <td className="px-4 py-2 font-mono">{m.phone_number}</td>
                      <td className="px-4 py-2">{m.body}</td>
                      <td className="px-4 py-2 font-mono">{m.ticket_number || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{new Date(m.created_at).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
