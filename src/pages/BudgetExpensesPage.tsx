import { CheckCircle2, FileText, Plus, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusTag } from '../components/StatusBadge.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch, buildAuthFileUrl } from '../lib/api.ts';
import { Budget, DropdownOption, Expense, Location, User, Vendor } from '../types.ts';

export function BudgetExpensesPage({ user }: { user: User }) {
  const { showToast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [bLocId, setBLocId] = useState('');
  const [bPeriod, setBPeriod] = useState<'annual' | 'monthly'>('annual');
  const [bMonth, setBMonth] = useState('1');
  const [bAmount, setBAmount] = useState('');
  const [bNotes, setBNotes] = useState('');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [eLocId, setELocId] = useState('');
  const [eVendorId, setEVendorId] = useState('');
  const [eCategory, setECategory] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eDate, setEDate] = useState(new Date().toISOString().slice(0, 10));
  const [eInvoiceNo, setEInvoiceNo] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eFile, setEFile] = useState<File | null>(null);

  const [reviewRemarks, setReviewRemarks] = useState<Record<number, string>>({});

  const loadAll = useCallback(async () => {
    try {
      const [bRes, eRes] = await Promise.all([
        apiFetch<{ budgets: Budget[] }>(`/api/budgets?fiscalYear=${fiscalYear}`),
        apiFetch<{ expenses: Expense[] }>('/api/expenses'),
      ]);
      setBudgets(bRes.budgets);
      setExpenses(eRes.expenses);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [fiscalYear, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    apiFetch<{ locations: Location[] }>('/api/locations')
      .then((r) => {
        setLocations(r.locations);
        if (r.locations[0]) {
          setBLocId(String(r.locations[0].id));
          setELocId(String(r.locations[0].id));
        }
      })
      .catch(() => {});
    apiFetch<{ vendors: Vendor[] }>('/api/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
    apiFetch<{ options: DropdownOption[] }>('/api/dropdowns?listKey=expense_categories')
      .then((r) => {
        setCategories(r.options);
        if (r.options[0]) setECategory(r.options[0].value);
      })
      .catch(() => {});
  }, []);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          locationId: Number(bLocId),
          fiscalYear,
          periodType: bPeriod,
          month: bPeriod === 'monthly' ? Number(bMonth) : null,
          allocatedAmount: Number(bAmount),
          notes: bNotes,
        }),
      });
      showToast('Location budget saved', 'success');
      setBAmount('');
      setBNotes('');
      setShowBudgetForm(false);
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('locationId', eLocId);
      if (eVendorId) fd.append('vendorId', eVendorId);
      fd.append('category', eCategory);
      fd.append('amount', eAmount);
      fd.append('expenseDate', eDate);
      fd.append('invoiceNumber', eInvoiceNo);
      fd.append('description', eDesc);
      if (eFile) fd.append('invoice', eFile);

      await apiFetch('/api/expenses', { method: 'POST', body: fd });
      showToast('Expense submitted for approval', 'success');
      setEAmount('');
      setEInvoiceNo('');
      setEDesc('');
      setEFile(null);
      setShowExpenseForm(false);
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleReview = async (id: number, status: 'Approved' | 'Rejected') => {
    try {
      await apiFetch(`/api/expenses/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, remarks: reviewRemarks[id] || '' }),
      });
      showToast(`Expense ${status.toLowerCase()}`, 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">IT Budget & Expenses</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hub-level budget allocations, invoice tracking, and expense approval governance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {[2024, 2025, 2026, 2027].map((yr) => (
              <option key={yr} value={yr}>
                FY {yr}
              </option>
            ))}
          </select>
          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => setShowBudgetForm((v) => !v)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Allocate Budget
            </button>
          )}
          {(user.role === 'super_admin' || user.role === 'moderator') && (
            <button
              type="button"
              onClick={() => setShowExpenseForm((v) => !v)}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Log Expense
            </button>
          )}
        </div>
      </div>

      {showBudgetForm && (
        <form
          onSubmit={handleSaveBudget}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <h2 className="font-display text-sm font-bold">Allocate Location Budget</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={bLocId}
              onChange={(e) => setBLocId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={bPeriod}
              onChange={(e) => setBPeriod(e.target.value as 'annual' | 'monthly')}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
            </select>
            {bPeriod === 'monthly' && (
              <select
                value={bMonth}
                onChange={(e) => setBMonth(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Month {m}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              required
              min="0"
              value={bAmount}
              onChange={(e) => setBAmount(e.target.value)}
              placeholder="Amount (INR)"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={bNotes}
              onChange={(e) => setBNotes(e.target.value)}
              placeholder="Budget notes"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
              Save Budget
            </button>
          </div>
        </form>
      )}

      {showExpenseForm && (
        <form
          onSubmit={handleSubmitExpense}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <h2 className="font-display text-sm font-bold">Submit IT Expense</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={eLocId}
              onChange={(e) => setELocId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={eCategory}
              onChange={(e) => setECategory(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={eVendorId}
              onChange={(e) => setEVendorId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">Select Vendor (Optional)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={eAmount}
              onChange={(e) => setEAmount(e.target.value)}
              placeholder="Amount (INR) *"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="date"
              required
              value={eDate}
              onChange={(e) => setEDate(e.target.value)}
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={eInvoiceNo}
              onChange={(e) => setEInvoiceNo(e.target.value)}
              placeholder="Invoice #"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setEFile(e.target.files?.[0] || null)}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-100 dark:file:bg-slate-800"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={eDesc}
              onChange={(e) => setEDesc(e.target.value)}
              placeholder="Expense description *"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
              Submit Expense
            </button>
          </div>
        </form>
      )}

      {/* Budget vs Actual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold mb-3">Budget vs Approved Actuals ({fiscalYear})</h2>
          {budgets.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No budgets allocated for FY {fiscalYear} yet.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="location_code" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="allocated_amount" fill="#94a3b8" name="Allocated" />
                  <Bar dataKey="actual_spent" fill="#1d4ed8" name="Approved Spend" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <h2 className="font-display text-sm font-bold mb-3">Location Budget Ledger</h2>
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="text-left py-2">Location</th>
                <th className="text-left py-2">Period</th>
                <th className="text-right py-2">Allocated</th>
                <th className="text-right py-2">Spent</th>
                <th className="text-right py-2">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {budgets.map((b) => {
                const pct = b.allocated_amount > 0 ? Math.round((b.actual_spent / b.allocated_amount) * 100) : 0;
                return (
                  <tr key={b.id}>
                    <td className="py-2 font-medium">{b.location_name}</td>
                    <td className="py-2 capitalize">{b.period_type === 'monthly' ? `Month ${b.month}` : 'Annual'}</td>
                    <td className="py-2 text-right font-mono tabular-nums">₹{b.allocated_amount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right font-mono tabular-nums">₹{b.actual_spent.toLocaleString('en-IN')}</td>
                    <td className={`py-2 text-right font-mono tabular-nums ${pct > 90 ? 'text-red-600 font-bold' : ''}`}>
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Approval Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-bold">Expense Submissions & Approvals</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Date & Invoice</th>
                <th className="text-left px-4 py-2.5">Location & Category</th>
                <th className="text-left px-4 py-2.5">Description</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No expenses logged yet.
                  </td>
                </tr>
              ) : (
                expenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono tabular-nums">{ex.expense_date}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {ex.invoice_number || 'No Inv #'}
                        {ex.invoice_file_name && (
                          <a
                            href={buildAuthFileUrl(`/api/expenses/${ex.id}/invoice`)}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <FileText className="w-3 h-3" /> Invoice
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{ex.location_name}</div>
                      <div className="text-slate-500">
                        {ex.category} {ex.vendor_name ? `· ${ex.vendor_name}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="truncate">{ex.description}</div>
                      {ex.remarks && <div className="text-[11px] text-slate-400">Remarks: {ex.remarks}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      ₹{ex.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag status={ex.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.role === 'super_admin' && ex.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="text"
                            placeholder="Remarks"
                            value={reviewRemarks[ex.id] || ''}
                            onChange={(e) => setReviewRemarks((p) => ({ ...p, [ex.id]: e.target.value }))}
                            className="w-28 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => handleReview(ex.id, 'Approved')}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Approve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(ex.id, 'Rejected')}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">{ex.reviewed_by_name || '—'}</span>
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
