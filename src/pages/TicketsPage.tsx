import { Download, Filter, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PriorityTag, StatusTag } from '../components/StatusBadge.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportToExcel } from '../lib/exporters.ts';
import { DropdownOption, Location, Ticket, User } from '../types.ts';

interface TicketsPageProps {
  user: User;
  refreshTrigger: number;
  onOpenTicket: (id: number) => void;
  onCreateTicket: () => void;
}

export function TicketsPage({ user, refreshTrigger, onOpenTicket, onCreateTicket }: TicketsPageProps) {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [moderators, setModerators] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState('all');
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');

  // Bulk selection (super_admin)
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkModId, setBulkModId] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      if (priority !== 'all') params.set('priority', priority);
      if (locationId) params.set('locationId', locationId);
      if (category !== 'all') params.set('category', category);
      if (breachedOnly) params.set('breached', 'true');
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);

      const res = await apiFetch<{ tickets: Ticket[] }>(`/api/tickets?${params.toString()}`);
      setTickets(res.tickets);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, status, priority, locationId, category, breachedOnly, sortBy, sortDir, showToast]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets, refreshTrigger]);

  useEffect(() => {
    apiFetch<{ locations: Location[] }>('/api/locations').then((r) => setLocations(r.locations)).catch(() => {});
    apiFetch<{ options: DropdownOption[] }>('/api/dropdowns?listKey=ticket_categories')
      .then((r) => setCategories(r.options))
      .catch(() => {});
    if (user.role === 'super_admin') {
      apiFetch<{ users: User[] }>('/api/users?role=moderator').then((r) => setModerators(r.users)).catch(() => {});
    }
  }, [user.role]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkAssign = async () => {
    if (!bulkModId || selectedIds.length === 0) return;
    try {
      await apiFetch('/api/tickets/bulk', {
        method: 'POST',
        body: JSON.stringify({ ticketIds: selectedIds, action: 'assign', value: Number(bulkModId) }),
      });
      showToast(`Assigned ${selectedIds.length} ticket(s)`, 'success');
      setSelectedIds([]);
      loadTickets();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    try {
      await apiFetch('/api/tickets/bulk', {
        method: 'POST',
        body: JSON.stringify({ ticketIds: selectedIds, action: 'status', value: bulkStatus }),
      });
      showToast(`Updated ${selectedIds.length} ticket(s)`, 'success');
      setSelectedIds([]);
      loadTickets();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleExport = () => {
    exportToExcel(
      `SDGlobal_Tickets_${new Date().toISOString().slice(0, 10)}`,
      'Tickets',
      tickets.map((t) => ({
        'Ticket #': t.ticket_number,
        Created: t.created_at,
        Reporter: t.reporter_name,
        Location: t.location_name || t.reporter_branch,
        Category: t.category,
        Device: `${t.device_type} ${t.device_name}`.trim(),
        Priority: t.priority,
        Impact: t.business_impact,
        Status: t.status,
        Moderator: t.moderator_name || 'Unassigned',
        'SLA Breached': t.sla_breached ? 'Yes' : 'No',
        'Work Minutes': t.total_working_minutes,
        'Cost (INR)': t.expenses_incurred,
      }))
    );
  };

  const title =
    user.role === 'employee'
      ? 'My IT Support Tickets'
      : user.role === 'moderator'
      ? 'Assigned Tasks & Queue'
      : 'Enterprise Ticket Queue';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing <span className="font-mono tabular-nums">{tickets.length}</span> ticket(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
          {user.role !== 'management' && (
            <button
              type="button"
              onClick={onCreateTicket}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Raise Ticket
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket #, reporter, serial, description..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="all">All Statuses</option>
          {[
            'New',
            'Assigned',
            'Accepted',
            'Under Review',
            'In Progress',
            'On Hold',
            'Pending Information',
            'Ready for Review',
            'Revision Required',
            'Resolved',
            'Completed',
            'Closed',
            'Rejected',
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="all">All Priorities</option>
          {['Critical', 'High', 'Medium', 'Low'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {user.role !== 'employee' && (
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="">All Locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.city}
              </option>
            ))}
          </select>
        )}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 px-2">
          <input
            type="checkbox"
            checked={breachedOnly}
            onChange={(e) => setBreachedOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          SLA Breached
        </label>
        <div className="flex items-center gap-1 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split(':');
              setSortBy(f);
              setSortDir(d as 'ASC' | 'DESC');
            }}
            className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="created_at:DESC">Newest First</option>
            <option value="created_at:ASC">Oldest First</option>
            <option value="priority:ASC">Priority (Critical First)</option>
            <option value="resolution_due_at:ASC">SLA Due Soonest</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {user.role === 'super_admin' && selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-blue-900 dark:text-blue-200">
            {selectedIds.length} selected
          </span>
          <select
            value={bulkModId}
            onChange={(e) => setBulkModId(e.target.value)}
            className="px-2.5 py-1 rounded border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-950"
          >
            <option value="">Assign Moderator...</option>
            {moderators.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkAssign}
            className="px-3 py-1 rounded bg-blue-700 text-white font-semibold"
          >
            Apply Assign
          </button>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="px-2.5 py-1 rounded border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-950"
          >
            <option value="">Change Status...</option>
            {['Under Review', 'In Progress', 'On Hold', 'Closed'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkStatus}
            className="px-3 py-1 rounded bg-slate-900 text-white font-semibold"
          >
            Apply Status
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-auto text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Dense Data Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                {user.role === 'super_admin' && (
                  <th className="px-3 py-2.5 text-left w-8">
                    <input
                      type="checkbox"
                      checked={tickets.length > 0 && selectedIds.length === tickets.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])}
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left">Ticket #</th>
                <th className="px-3 py-2.5 text-left">Issue & Device</th>
                <th className="px-3 py-2.5 text-left">Reporter & Hub</th>
                <th className="px-3 py-2.5 text-left">Priority</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Assigned Tech</th>
                <th className="px-3 py-2.5 text-right">SLA Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Loading tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center space-y-2">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching tickets found</div>
                    <p className="text-xs text-slate-500">Adjust filters or raise a new IT support ticket.</p>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onOpenTicket(t.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    {user.role === 'super_admin' && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(t.id)}
                          onChange={() => toggleSelect(t.id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-mono font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                      {t.ticket_number}
                      {t.sla_breached === 1 && (
                        <div className="text-[10px] font-sans font-bold text-red-600">SLA Breached</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {t.category} · {t.device_type}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 truncate">{t.description}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{t.reporter_name}</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {t.location_code || t.reporter_branch} · {t.reporter_department}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityTag priority={t.priority} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusTag status={t.status} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {t.moderator_name || <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {t.resolution_due_at ? (
                        <span className={t.sla_breached ? 'text-red-600 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                          {new Date(t.resolution_due_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
