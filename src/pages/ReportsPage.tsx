import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportToExcel, exportToPdf } from '../lib/exporters.ts';
import { Location } from '../types.ts';

type ReportType = 'tickets' | 'sla' | 'assets' | 'expenses' | 'moderators';

const REPORT_META: Record<
  ReportType,
  { title: string; columns: { header: string; key: string }[] }
> = {
  tickets: {
    title: 'IT Support Ticket Report',
    columns: [
      { header: 'Ticket #', key: 'ticket_number' },
      { header: 'Reporter', key: 'reporter_name' },
      { header: 'Location', key: 'location' },
      { header: 'Category', key: 'category' },
      { header: 'Priority', key: 'priority' },
      { header: 'Status', key: 'status' },
      { header: 'Moderator', key: 'moderator' },
      { header: 'SLA State', key: 'sla_state' },
      { header: 'Cost (INR)', key: 'expenses_incurred' },
    ],
  },
  sla: {
    title: 'SLA Compliance Report',
    columns: [
      { header: 'Priority', key: 'priority' },
      { header: 'Total Tickets', key: 'total' },
      { header: 'Compliant', key: 'compliant' },
      { header: 'Breached', key: 'breached' },
      { header: 'Compliance %', key: 'compliance_pct' },
      { header: 'Avg Resolution (h)', key: 'avg_resolution_hours' },
    ],
  },
  assets: {
    title: 'IT Asset Inventory Report',
    columns: [
      { header: 'Asset Tag', key: 'asset_tag' },
      { header: 'Serial #', key: 'serial_number' },
      { header: 'Category', key: 'category' },
      { header: 'Brand', key: 'brand' },
      { header: 'Model', key: 'model' },
      { header: 'Location', key: 'location' },
      { header: 'Condition', key: 'condition' },
      { header: 'Cost (INR)', key: 'purchase_cost' },
    ],
  },
  expenses: {
    title: 'IT Expense Ledger Report',
    columns: [
      { header: 'Date', key: 'expense_date' },
      { header: 'Location', key: 'location' },
      { header: 'Category', key: 'category' },
      { header: 'Vendor', key: 'vendor' },
      { header: 'Invoice #', key: 'invoice_number' },
      { header: 'Amount (INR)', key: 'amount' },
      { header: 'Status', key: 'status' },
    ],
  },
  moderators: {
    title: 'Moderator Performance Report',
    columns: [
      { header: 'Technician', key: 'full_name' },
      { header: 'Specialization', key: 'specialization' },
      { header: 'Total Assigned', key: 'total_assigned' },
      { header: 'Completed', key: 'completed' },
      { header: 'SLA Breached', key: 'sla_breached' },
      { header: 'Minutes Logged', key: 'total_minutes_logged' },
      { header: 'Rating', key: 'rating' },
    ],
  },
};

export function ReportsPage() {
  const { showToast } = useToast();
  const [reportType, setReportType] = useState<ReportType>('tickets');
  const [locationId, setLocationId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ locations: Location[] }>('/api/locations').then((r) => setLocations(r.locations)).catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationId) params.set('locationId', locationId);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      const res = await apiFetch<{ rows: Record<string, unknown>[] }>(`/api/reports/${reportType}?${params.toString()}`);
      setRows(res.rows);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [reportType, locationId, fromDate, toDate, showToast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const meta = REPORT_META[reportType];

  const handleExcel = () => {
    exportToExcel(`SDGlobal_${reportType}_report_${new Date().toISOString().slice(0, 10)}`, meta.title, rows);
  };

  const handlePdf = () => {
    exportToPdf(
      `SDGlobal_${reportType}_report_${new Date().toISOString().slice(0, 10)}`,
      meta.title,
      `Records: ${rows.length}`,
      meta.columns,
      rows
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Reports & Exports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generate audit-ready PDF and Excel reports across tickets, SLAs, assets, budgets, and technicians.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExcel}
            disabled={rows.length === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Excel
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={rows.length === 0}
            className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Report Selector & Filters */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg">
          {(Object.keys(REPORT_META) as ReportType[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setReportType(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize ${
                reportType === key
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="">All Locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>

        {reportType === 'tickets' && (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </>
        )}

        <button
          type="button"
          onClick={fetchReport}
          className="ml-auto px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Preview Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="font-display text-sm font-bold">{meta.title}</span>
          <span className="font-mono text-xs text-slate-500 tabular-nums">{rows.length} record(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                {meta.columns.map((c) => (
                  <th key={c.key} className="text-left px-4 py-2.5 whitespace-nowrap">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={meta.columns.length} className="px-4 py-8 text-center text-slate-400">
                    Generating report...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={meta.columns.length} className="px-4 py-10 text-center text-slate-500">
                    No records match the selected report parameters.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {meta.columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                        {String(r[c.key] ?? '—')}
                      </td>
                    ))}
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
