import { LogOut, Search, Shield } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';

interface SessionRow {
  id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  mobile: string | null;
  role: string;
  ip_address: string;
  user_agent: string;
  login_at: string;
  last_activity_at: string;
  logout_at: string | null;
  is_active: number;
}

interface AuditRow {
  id: number;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export function SessionsAuditPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'sessions' | 'audit'>('sessions');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        apiFetch<{ sessions: SessionRow[] }>('/api/sessions'),
        apiFetch<{ logs: AuditRow[] }>(`/api/audit-logs?search=${encodeURIComponent(search)}`),
      ]);
      setSessions(sRes.sessions);
      setLogs(aRes.logs);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [search, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRevoke = async (id: number) => {
    try {
      await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      showToast('Session terminated', 'info');
      loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const formatDuration = (start: string, end: string) => {
    const ms = Math.max(0, Date.parse(end + 'Z') - Date.parse(start + 'Z'));
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" /> Sessions & Audit Logs
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Super Admin security telemetry: monitor active sessions, IP addresses, and immutable audit trail.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('sessions')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
              tab === 'sessions'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Login Sessions ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
              tab === 'audit'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Audit Trail ({logs.length})
          </button>
        </div>

        {tab === 'audit' && (
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter audit actions, actor, details..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        )}
      </div>

      {tab === 'sessions' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">User</th>
                  <th className="text-left px-4 py-2.5">IP & Device</th>
                  <th className="text-left px-4 py-2.5">Login</th>
                  <th className="text-left px-4 py-2.5">Duration</th>
                  <th className="text-left px-4 py-2.5">State</th>
                  <th className="text-right px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{s.full_name}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {s.role} · {s.email || s.mobile}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="font-mono">{s.ip_address}</div>
                      <div className="text-[11px] text-slate-400 truncate">{s.user_agent}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{s.login_at}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">
                      {formatDuration(s.login_at, s.logout_at || s.last_activity_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                          s.is_active
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                            : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                        }`}
                      >
                        {s.is_active ? 'Active' : 'Ended'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(s.id)}
                          className="text-red-600 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Terminate
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">Timestamp</th>
                  <th className="text-left px-4 py-2.5">Actor</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                  <th className="text-left px-4 py-2.5">Entity</th>
                  <th className="text-left px-4 py-2.5">Details</th>
                  <th className="text-right px-4 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-mono tabular-nums whitespace-nowrap text-slate-500">
                      {l.created_at}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-semibold">{l.user_name}</span>{' '}
                      <span className="text-[11px] font-mono text-slate-400">({l.user_role})</span>
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-blue-700 dark:text-blue-400">{l.action}</td>
                    <td className="px-4 py-2 font-mono">
                      {l.entity_type}#{l.entity_id}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{l.details}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-400">{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
