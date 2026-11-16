import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  IndianRupee,
  Plus,
  Ticket as TicketIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api.ts';
import { User } from '../types.ts';

interface DashboardSummary {
  kpis: {
    total_tickets: number;
    open_tickets: number;
    resolved_tickets: number;
    active_breaches: number;
    total_breached: number;
    critical_open: number;
    avg_mttr_hours: number | null;
    avg_work_minutes: number | null;
  };
  statusMix: Array<{ status: string; count: number }>;
  priorityMix: Array<{ priority: string; count: number }>;
  volumeTrend: Array<{ day: string; created: number; resolved: number }>;
  locationHeatmap: Array<{
    id: number;
    name: string;
    code: string;
    city: string;
    total_tickets: number;
    open_tickets: number;
    breached_tickets: number;
  }>;
  moderatorWorkload: Array<{
    id: number;
    full_name: string;
    specialization: string;
    capacity: number;
    rating: number;
    mod_status: string;
    active_tickets: number;
    completed_tickets: number;
    total_minutes: number;
  }>;
  budgetSummary: Array<{
    location_name: string;
    location_code: string;
    allocated: number;
    spent: number;
  }>;
  assetStats: {
    total?: number;
    operational?: number;
    under_repair?: number;
    total_value?: number;
  };
}

export function DashboardPage({
  user,
  onRaiseTicket,
  onNavigateTickets,
}: {
  user: User;
  onRaiseTicket: () => void;
  onNavigateTickets: () => void;
}) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardSummary>('/api/dashboard/summary')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const totalTickets = k.total_tickets || 0;
  const slaCompliance = totalTickets > 0 ? Math.round(((totalTickets - (k.total_breached || 0)) / totalTickets) * 100) : 100;
  const isStaffWide = user.role === 'super_admin' || user.role === 'management';

  const totalAllocated = data.budgetSummary.reduce((acc, b) => acc + (b.allocated || 0), 0);
  const totalSpent = data.budgetSummary.reduce((acc, b) => acc + (b.spent || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Role Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {user.role === 'super_admin'
              ? 'Enterprise IT Operations Overview'
              : user.role === 'management'
              ? 'Executive IT Governance & Spend'
              : user.role === 'moderator'
              ? 'Technician Operations Workspace'
              : `Welcome, ${user.full_name}`}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {user.location_name ? `${user.location_name} (${user.location_code})` : 'SD Global Logistics Network'}
            {' · '}
            {user.department_name || user.role.replace('_', ' ')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateTickets}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            View All Tickets
          </button>
          {user.role !== 'management' && (
            <button
              type="button"
              onClick={onRaiseTicket}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Raise IT Ticket
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Open Tickets</span>
            <TicketIcon className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {k.open_tickets || 0}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">{k.total_tickets || 0}</span> total ·{' '}
            <span className="font-mono tabular-nums">{k.critical_open || 0}</span> critical open
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>SLA Compliance</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {slaCompliance}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className={`font-mono tabular-nums ${(k.active_breaches || 0) > 0 ? 'text-red-600 font-semibold' : ''}`}>
              {k.active_breaches || 0}
            </span>{' '}
            active overdue breaches
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Mean Resolution (MTTR)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {k.avg_mttr_hours !== null && k.avg_mttr_hours !== undefined ? `${k.avg_mttr_hours}h` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Avg technician time: <span className="font-mono tabular-nums">{k.avg_work_minutes || 0}m</span>
          </div>
        </div>

        {isStaffWide ? (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Annual IT Spend vs Budget</span>
              <IndianRupee className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              ₹{totalSpent.toLocaleString('en-IN')}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              of <span className="font-mono tabular-nums">₹{totalAllocated.toLocaleString('en-IN')}</span> allocated ·{' '}
              <span className="font-mono">{data.assetStats.total || 0}</span> assets
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Resolved Tickets</span>
              <HardDrive className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {k.resolved_tickets || 0}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Completed & verified requests</div>
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">14-Day Ticket Volume</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Created vs resolved daily throughput</p>
            </div>
          </div>
          <div className="h-64">
            {data.volumeTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No ticket volume recorded in the last 14 days yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="created" stroke="#1d4ed8" fill="#3b82f6" fillOpacity={0.18} name="Created" />
                  <Area type="monotone" dataKey="resolved" stroke="#059669" fill="#10b981" fillOpacity={0.18} name="Resolved" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="mb-4">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">Status Distribution</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Active tickets across workflow stages</p>
          </div>
          <div className="h-64">
            {data.statusMix.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Raise a ticket to populate status metrics.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.statusMix} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="status" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Tickets" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Staff-wide Operational Grids */}
      {isStaffWide && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Location Heatmap */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
              Logistics Hub Ticket Heatmap
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="text-left py-2">Location</th>
                    <th className="text-right py-2">Total</th>
                    <th className="text-right py-2">Open</th>
                    <th className="text-right py-2">Breaches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.locationHeatmap.map((loc) => (
                    <tr key={loc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{loc.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {loc.code} · {loc.city}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{loc.total_tickets}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{loc.open_tickets}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        <span className={loc.breached_tickets > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>
                          {loc.breached_tickets}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Budget vs Actual Chart + Moderator Workload */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-1">
                Location IT Budget vs Approved Spend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Fiscal year {new Date().getFullYear()}</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.budgetSummary}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis dataKey="location_code" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="allocated" fill="#cbd5e1" name="Allocated (INR)" />
                    <Bar dataKey="spent" fill="#1d4ed8" name="Spent (INR)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Moderator Workload
              </h3>
              {data.moderatorWorkload.length === 0 ? (
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> No IT moderators provisioned yet. Add technicians under Moderators & Access.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.moderatorWorkload.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{m.full_name}</span>
                        <span className="text-slate-400 ml-2">{m.specialization}</span>
                      </div>
                      <span className="font-mono tabular-nums">
                        {m.active_tickets}/{m.capacity} active · {m.completed_tickets} done
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
