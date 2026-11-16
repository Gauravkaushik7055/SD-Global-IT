import { ArrowDown, ArrowUp, Edit2, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { DropdownOption } from '../types.ts';

const LIST_KEYS: { key: string; label: string }[] = [
  { key: 'ticket_categories', label: 'Ticket Issue Categories' },
  { key: 'device_types', label: 'Device Types' },
  { key: 'asset_categories', label: 'Asset Categories' },
  { key: 'expense_categories', label: 'Expense Categories' },
  { key: 'work_types', label: 'Technician Work Types' },
];

export function DropdownManagerPage() {
  const { showToast } = useToast();
  const [activeKey, setActiveKey] = useState('ticket_categories');
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const loadOptions = useCallback(async () => {
    try {
      const res = await apiFetch<{ options: DropdownOption[] }>(
        `/api/dropdowns?listKey=${activeKey}&includeInactive=true`
      );
      setOptions(res.options);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [activeKey, showToast]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    try {
      await apiFetch('/api/dropdowns', {
        method: 'POST',
        body: JSON.stringify({ listKey: activeKey, label: newLabel.trim(), value: newLabel.trim() }),
      });
      setNewLabel('');
      showToast('Option added', 'success');
      loadOptions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await apiFetch(`/api/dropdowns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: editLabel, value: editLabel }),
      });
      setEditingId(null);
      loadOptions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleMove = async (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= options.length) return;
    const copy = [...options];
    const [moved] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, moved);
    setOptions(copy);
    try {
      await apiFetch('/api/dropdowns/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: copy.map((o) => o.id) }),
      });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/dropdowns/${id}`, { method: 'DELETE' });
      showToast('Option deleted', 'info');
      loadOptions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Dropdown Manager</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure dynamic option lists consumed across ticketing, asset registry, and expense forms.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 h-fit">
          {LIST_KEYS.map((lk) => (
            <button
              key={lk.key}
              type="button"
              onClick={() => setActiveKey(lk.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeKey === lk.key
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {lk.label}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <form onSubmit={handleAdd} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex gap-2.5">
            <input
              type="text"
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={`Add new option to ${LIST_KEYS.find((k) => k.key === activeKey)?.label}...`}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Option
            </button>
          </form>

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {options.map((opt, idx) => (
              <div key={opt.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                {editingId === opt.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(opt.id)}
                      className="px-3 py-1 rounded bg-blue-700 text-white text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-400 w-5">{idx + 1}.</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{opt.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 1)}
                        disabled={idx === options.length - 1}
                        className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(opt.id);
                          setEditLabel(opt.label);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(opt.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
