import { Copy, KeyRound, Plus, RefreshCw, Shield, UserCheck } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Location, User } from '../types.ts';

export function ModeratorsPage() {
  const { showToast } = useToast();
  const [moderators, setModerators] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [commonToken, setCommonToken] = useState('');
  const [invites, setInvites] = useState<Array<{ id: number; user_id: number; token: string; expires_at: string; used_at: string | null; full_name: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [specialization, setSpecialization] = useState('Warehouse Hardware & Printers');
  const [capacity, setCapacity] = useState('10');
  const [selectedLocs, setSelectedLocs] = useState<number[]>([]);
  const [lastInviteUrl, setLastInviteUrl] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [uRes, lRes, iRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/users?role=moderator'),
        apiFetch<{ locations: Location[] }>('/api/locations'),
        apiFetch<{ invites: typeof invites; commonLink: { token: string } | null }>('/api/moderators/invites'),
      ]);
      setModerators(uRes.users);
      setLocations(lRes.locations);
      setInvites(iRes.invites.filter((i) => !i.used_at && i.user_id));
      setCommonToken(iRes.commonLink?.token || '');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard', 'success');
  };

  const handleCreateModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ inviteToken: string | null }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          role: 'moderator',
          fullName,
          email,
          mobile,
          specialization,
          capacity: Number(capacity),
          assignedLocations: selectedLocs,
          generateInvite: true,
        }),
      });
      if (res.inviteToken) {
        setLastInviteUrl(`${window.location.origin}/?invite=${res.inviteToken}`);
      }
      showToast('Moderator created with one-time invite link', 'success');
      setFullName('');
      setEmail('');
      setMobile('');
      setShowCreate(false);
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRegenerateInvite = async (userId: number) => {
    try {
      const res = await apiFetch<{ token: string }>(`/api/moderators/${userId}/invite`, { method: 'POST' });
      const url = `${window.location.origin}/?invite=${res.token}`;
      setLastInviteUrl(url);
      copyLink(url);
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRegenerateCommon = async () => {
    try {
      const res = await apiFetch<{ token: string }>('/api/moderators/common-link/regenerate', { method: 'POST' });
      setCommonToken(res.token);
      showToast('Common moderator access link regenerated', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleToggleActive = async (mod: User) => {
    try {
      await apiFetch(`/api/users/${mod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !mod.is_active }),
      });
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const commonUrl = commonToken ? `${window.location.origin}/?commonInvite=${commonToken}` : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Moderators & Access</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Provision IT technicians, manage capacity & locations, and issue onboarding invite links.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add IT Moderator
        </button>
      </div>

      {/* Common Moderator Access Link Panel */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-blue-600" /> Shared Common Moderator Access Link
          </div>
          <div className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
            {commonUrl || 'Not initialized'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {commonUrl && (
            <button
              type="button"
              onClick={() => copyLink(commonUrl)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Link
            </button>
          )}
          <button
            type="button"
            onClick={handleRegenerateCommon}
            className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
          </button>
        </div>
      </div>

      {lastInviteUrl && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200">
              One-Time Moderator Invite Link Ready (72h expiry):
            </div>
            <div className="font-mono text-emerald-800 dark:text-emerald-300 break-all mt-0.5">{lastInviteUrl}</div>
          </div>
          <button
            type="button"
            onClick={() => copyLink(lastInviteUrl)}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Invite URL
          </button>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreateModerator}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <h2 className="font-display text-sm font-bold">Provision New IT Moderator</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name *"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Corporate Email *"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Mobile (10 digits)"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder="Specialization (e.g. Barcode Scanners, Networking)"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="number"
              min="1"
              max="50"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Ticket Capacity"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Assigned Hubs:</div>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <label key={l.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLocs.includes(l.id)}
                    onChange={(e) =>
                      setSelectedLocs((prev) =>
                        e.target.checked ? [...prev, l.id] : prev.filter((id) => id !== l.id)
                      )
                    }
                  />
                  <span>{l.code} ({l.city})</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
              Create & Generate Invite Link
            </button>
          </div>
        </form>
      )}

      {/* Moderators Directory */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Technician</th>
                <th className="text-left px-4 py-2.5">Specialization</th>
                <th className="text-right px-4 py-2.5">Active / Capacity</th>
                <th className="text-right px-4 py-2.5">Completed</th>
                <th className="text-right px-4 py-2.5">Rating</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {moderators.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No moderators created yet. Use "Add IT Moderator" or share the common access link above.
                  </td>
                </tr>
              ) : (
                moderators.map((m) => {
                  const pendingInv = invites.find((i) => i.user_id === m.id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{m.full_name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{m.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.specialization || 'General IT'}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {m.active_ticket_count || 0} / {m.capacity || 10}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{m.completed_ticket_count || 0}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{(m.rating || 5).toFixed(1)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${
                            m.is_active
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                              : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                          }`}
                        >
                          {m.is_active ? <UserCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          {m.is_active ? m.mod_status || 'available' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {pendingInv && (
                          <button
                            type="button"
                            onClick={() => copyLink(`${window.location.origin}/?invite=${pendingInv.token}`)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            Copy Pending Invite
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRegenerateInvite(m.id)}
                          className="text-slate-600 dark:text-slate-300 hover:underline font-medium"
                        >
                          New Invite
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(m)}
                          className="text-red-600 dark:text-red-400 hover:underline font-medium"
                        >
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
