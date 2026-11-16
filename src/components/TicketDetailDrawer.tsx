import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Square,
  UserPlus,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { PriorityTag, StatusTag } from '../components/StatusBadge.tsx';
import { StatusRoadmapTracker } from '../components/StatusRoadmapTracker.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch, buildAuthFileUrl } from '../lib/api.ts';
import {
  DropdownOption,
  Ticket,
  TicketActivity,
  TicketAttachment,
  TicketComment,
  TicketTimeLog,
  User,
} from '../types.ts';

interface TicketDetailDrawerProps {
  ticketId: number | null;
  user: User;
  onClose: () => void;
  onUpdated: () => void;
}

interface TicketDetailPayload {
  ticket: Ticket;
  attachments: TicketAttachment[];
  comments: TicketComment[];
  assignments: Array<{
    id: number;
    moderator_name: string;
    assigned_by_name: string;
    reason: string;
    deadline: string | null;
    status: string;
    rejection_reason: string;
    created_at: string;
  }>;
  timeLogs: TicketTimeLog[];
  activities: TicketActivity[];
  maintenance: Array<{
    id: number;
    maintenance_type: string;
    vendor_name: string;
    cost: number;
    description: string;
    maintenance_date: string;
  }>;
}

export function TicketDetailDrawer({ ticketId, user, onClose, onUpdated }: TicketDetailDrawerProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<TicketDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'comments' | 'attachments' | 'logs' | 'timeline'>('overview');

  const [moderators, setModerators] = useState<User[]>([]);
  const [workTypes, setWorkTypes] = useState<DropdownOption[]>([]);

  // Assign form
  const [assignModId, setAssignModId] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // Reject form
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  // Timer form
  const [timerWorkType, setTimerWorkType] = useState('On-Site Repair');
  const [timerNotes, setTimerNotes] = useState('');

  // Status & resolution form
  const [nextStatus, setNextStatus] = useState('');
  const [resolutionText, setResolutionText] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Parts form
  const [partName, setPartName] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partCost, setPartCost] = useState('0');
  const [partSerial, setPartSerial] = useState('');

  // Employee confirm
  const [empFeedback, setEmpFeedback] = useState('');
  const [empRating, setEmpRating] = useState('5');

  // Comments
  const [commentBody, setCommentBody] = useState('');
  const [commentChannel, setCommentChannel] = useState<'portal' | 'internal' | 'outlook' | 'whatsapp'>('portal');

  const loadDetail = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await apiFetch<TicketDetailPayload>(`/api/tickets/${ticketId}`);
      setData(res);
      setResolutionText(res.ticket.resolution_description || '');
      setNextStatus(res.ticket.status);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [ticketId, showToast]);

  useEffect(() => {
    if (!ticketId) return;
    loadDetail();
    if (user.role === 'super_admin') {
      apiFetch<{ users: User[] }>('/api/users?role=moderator')
        .then((res) => setModerators(res.users))
        .catch(() => {});
    }
    apiFetch<{ options: DropdownOption[] }>('/api/dropdowns?listKey=work_types')
      .then((res) => {
        setWorkTypes(res.options);
        if (res.options[0]) setTimerWorkType(res.options[0].value);
      })
      .catch(() => {});
  }, [ticketId, user.role, loadDetail]);

  if (!ticketId) return null;

  const ticket = data?.ticket;
  const activeTimer = data?.timeLogs.find((tl) => !tl.ended_at && tl.moderator_id === user.id);
  const partsList: Array<{ partName: string; quantity: number; cost: number; serial?: string; addedBy?: string }> = ticket
    ? (() => {
        try {
          return JSON.parse(ticket.parts_replaced || '[]');
        } catch {
          return [];
        }
      })()
    : [];

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/tickets/${ticketId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          moderatorId: Number(assignModId),
          deadline: assignDeadline || null,
          reason: assignReason,
        }),
      });
      showToast('Moderator assigned', 'success');
      setAssignReason('');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRespond = async (action: 'accept' | 'reject') => {
    try {
      await apiFetch(`/api/tickets/${ticketId}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ action, rejectionReason: rejectReason }),
      });
      showToast(action === 'accept' ? 'Ticket accepted' : 'Assignment rejected', 'info');
      setShowRejectBox(false);
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          resolutionDescription: resolutionText,
          note: statusNote,
        }),
      });
      showToast(`Ticket updated to ${nextStatus}`, 'success');
      setStatusNote('');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleStartTimer = async () => {
    try {
      await apiFetch(`/api/tickets/${ticketId}/timer/start`, {
        method: 'POST',
        body: JSON.stringify({ workType: timerWorkType, notes: timerNotes }),
      });
      showToast('Work timer started', 'success');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleStopTimer = async () => {
    try {
      const res = await apiFetch<{ durationMinutes: number }>(`/api/tickets/${ticketId}/timer/stop`, {
        method: 'POST',
        body: JSON.stringify({ notes: timerNotes }),
      });
      showToast(`Logged ${res.durationMinutes} minute(s)`, 'success');
      setTimerNotes('');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/tickets/${ticketId}/parts`, {
        method: 'POST',
        body: JSON.stringify({
          partName,
          quantity: Number(partQty),
          cost: Number(partCost),
          serial: partSerial,
        }),
      });
      showToast('Part & cost recorded', 'success');
      setPartName('');
      setPartQty('1');
      setPartCost('0');
      setPartSerial('');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleEmployeeConfirm = async (confirmed: boolean) => {
    try {
      await apiFetch(`/api/tickets/${ticketId}/confirm`, {
        method: 'PATCH',
        body: JSON.stringify({ confirmed, feedback: empFeedback, rating: Number(empRating) }),
      });
      showToast(confirmed ? 'Resolution confirmed!' : 'Revision requested', confirmed ? 'success' : 'info');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAdminVerify = async () => {
    try {
      await apiFetch(`/api/tickets/${ticketId}/verify`, { method: 'PATCH' });
      showToast('Ticket verified and completed', 'success');
      await loadDetail();
      onUpdated();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      if (commentChannel === 'outlook' && ticket?.reporter_email) {
        await apiFetch('/api/integrations/outlook/send', {
          method: 'POST',
          body: JSON.stringify({
            toEmail: ticket.reporter_email,
            subject: `Re: [${ticket.ticket_number}] ${ticket.category}`,
            body: commentBody,
            ticketId,
          }),
        });
      } else if (commentChannel === 'whatsapp' && ticket?.reporter_mobile) {
        await apiFetch('/api/integrations/whatsapp/send', {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: ticket.reporter_mobile,
            body: `[${ticket.ticket_number}] ${commentBody}`,
            ticketId,
          }),
        });
      } else {
        await apiFetch(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          body: JSON.stringify({
            body: commentBody,
            channel: commentChannel === 'internal' ? 'internal' : 'portal',
            isInternal: commentChannel === 'internal',
          }),
        });
      }
      setCommentBody('');
      showToast('Comment posted', 'success');
      await loadDetail();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          {ticket ? (
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
                  {ticket.ticket_number}
                </span>
                <PriorityTag priority={ticket.priority} />
                <StatusTag status={ticket.status} />
                {ticket.sla_breached === 1 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-600 text-white">SLA Breached</span>
                )}
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                {ticket.category} — {ticket.device_type} {ticket.device_name ? `(${ticket.device_name})` : ''}
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                <span>{ticket.reporter_branch || ticket.location_name}</span>
                <span aria-hidden="true">·</span>
                <span>Impact: {ticket.business_impact}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Logged {new Date(ticket.created_at).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Loading ticket details...</div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        {loading && !ticket ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading ticket...</div>
        ) : ticket ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Visual Status Roadmap */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
              <StatusRoadmapTracker
                status={ticket.status}
                timestamps={{
                  New: ticket.created_at,
                  Assigned: ticket.assigned_at,
                  Accepted: ticket.accepted_at,
                  'Under Review': ticket.review_started_at,
                  'In Progress': ticket.work_started_at,
                  'Ready for Review': ticket.submitted_for_review_at,
                  Completed: ticket.completed_at,
                }}
              />
            </div>

            {/* Sub-navigation tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
              {[
                { id: 'overview', label: 'Overview & Workflow' },
                { id: 'comments', label: `Comments (${data.comments.length})` },
                { id: 'attachments', label: `Attachments (${data.attachments.length})` },
                { id: 'logs', label: `Time & Parts (${data.timeLogs.length})` },
                { id: 'timeline', label: `Activity (${data.activities.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as typeof activeTab)}
                  className={`px-3.5 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === t.id
                      ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Description + SLA + Reporter Snapshot */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Issue Description</h3>
                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {ticket.description}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-slate-400">Linked Asset</div>
                          <div className="font-mono font-medium">{ticket.linked_asset_tag || 'Manual Entry'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Serial Number</div>
                          <div className="font-mono font-medium">{ticket.serial_number || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Work Logged</div>
                          <div className="font-mono font-medium tabular-nums">{ticket.total_working_minutes} min</div>
                        </div>
                      </div>
                    </div>

                    {ticket.resolution_description && (
                      <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <h3 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                          Resolution Summary
                        </h3>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                          {ticket.resolution_description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Reporter & SLA Snapshot */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">Reporter & SLA</h3>
                    <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                      <div>
                        <span className="text-slate-400">Name:</span> <strong>{ticket.reporter_name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Emp Code:</span>{' '}
                        <span className="font-mono">{ticket.reporter_employee_code || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Department:</span> {ticket.reporter_department || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Designation:</span> {ticket.reporter_designation || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Mobile:</span>{' '}
                        <span className="font-mono">{ticket.reporter_mobile || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Branch / City:</span> {ticket.reporter_branch} ({ticket.reporter_city})
                      </div>
                      <div>
                        <span className="text-slate-400">Manager:</span> {ticket.reporter_reporting_manager || '—'}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Response Due</span>
                        <span className="font-mono tabular-nums">
                          {ticket.first_response_due_at
                            ? new Date(ticket.first_response_due_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Resolution Due</span>
                        <span className={`font-mono tabular-nums ${ticket.sla_breached ? 'text-red-600 font-bold' : ''}`}>
                          {ticket.resolution_due_at
                            ? new Date(ticket.resolution_due_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Assigned Tech</span>
                        <span className="font-medium">{ticket.moderator_name || 'Unassigned'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Role Action Panels */}
                {/* 1. Super Admin Assignment / Reassignment */}
                {user.role === 'super_admin' && (
                  <form
                    onSubmit={handleAssign}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-blue-600" />
                      {ticket.assigned_moderator_id ? 'Reassign Moderator' : 'Assign Moderator'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        required
                        value={assignModId}
                        onChange={(e) => setAssignModId(e.target.value)}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="">Select IT Moderator...</option>
                        {moderators.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name} ({m.active_ticket_count || 0}/{m.capacity || 10} load)
                          </option>
                        ))}
                      </select>
                      <input
                        type="datetime-local"
                        value={assignDeadline}
                        onChange={(e) => setAssignDeadline(e.target.value)}
                        className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={assignReason}
                        onChange={(e) => setAssignReason(e.target.value)}
                        placeholder="Assignment reason / instructions"
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                      >
                        {ticket.assigned_moderator_id ? 'Reassign Ticket' : 'Assign Ticket'}
                      </button>
                    </div>
                  </form>
                )}

                {/* 2. Moderator Accept / Reject Assignment */}
                {(user.role === 'moderator' || user.role === 'super_admin') &&
                  ticket.status === 'Assigned' &&
                  ticket.assigned_moderator_id && (
                    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          Assignment Action Required: Accept or decline this ticket assignment.
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRespond('accept')}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRejectBox((v) => !v)}
                            className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                      {showRejectBox && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejecting assignment..."
                            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => handleRespond('reject')}
                            className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                {/* 3. Work Timer & Status Transition (Moderator / Admin) */}
                {(user.role === 'moderator' || user.role === 'super_admin') &&
                  !['Completed', 'Closed'].includes(ticket.status) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Work Timer */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-blue-600" /> Work Timer
                        </h3>
                        <select
                          value={timerWorkType}
                          onChange={(e) => setTimerWorkType(e.target.value)}
                          disabled={Boolean(activeTimer)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {workTypes.map((w) => (
                            <option key={w.id} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={timerNotes}
                          onChange={(e) => setTimerNotes(e.target.value)}
                          placeholder="Diagnostic or repair notes..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        {activeTimer ? (
                          <button
                            type="button"
                            onClick={handleStopTimer}
                            className="w-full py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-2"
                          >
                            <Square className="w-3.5 h-3.5" /> Stop Timer & Log Time
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStartTimer}
                            className="w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold flex items-center justify-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5" /> Start Work Timer
                          </button>
                        )}
                      </div>

                      {/* Workflow Transition */}
                      <form
                        onSubmit={handleStatusUpdate}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Wrench className="w-4 h-4 text-blue-600" /> Update Workflow & Resolution
                        </h3>
                        <select
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {[
                            'Under Review',
                            'In Progress',
                            'On Hold',
                            'Pending Information',
                            'Ready for Review',
                            'Revision Required',
                            'Resolved',
                            'Closed',
                          ].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          value={resolutionText}
                          onChange={(e) => setResolutionText(e.target.value)}
                          placeholder="Root cause & resolution summary..."
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={statusNote}
                            onChange={(e) => setStatusNote(e.target.value)}
                            placeholder="Transition note (optional)"
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                          >
                            Update Status
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                {/* 4. Employee Confirmation / Reopen */}
                {ticket.status === 'Ready for Review' &&
                  (user.role === 'employee' || user.role === 'super_admin') && (
                    <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Confirm Ticket Resolution
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        IT Support marked this issue as Ready for Review. Please verify that your workstation/device is working normally.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={empFeedback}
                          onChange={(e) => setEmpFeedback(e.target.value)}
                          placeholder="Feedback or reason if reopening..."
                          className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <select
                          value={empRating}
                          onChange={(e) => setEmpRating(e.target.value)}
                          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="5">5 / 5 — Excellent</option>
                          <option value="4">4 / 5 — Good</option>
                          <option value="3">3 / 5 — Satisfactory</option>
                          <option value="2">2 / 5 — Needs Improvement</option>
                          <option value="1">1 / 5 — Unresolved</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleEmployeeConfirm(true)}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          Confirm Resolved
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEmployeeConfirm(false)}
                          className="px-4 py-2 rounded-lg border border-orange-300 text-orange-700 dark:text-orange-300 text-xs font-semibold hover:bg-orange-50 dark:hover:bg-orange-950/40"
                        >
                          Reopen / Revision Required
                        </button>
                      </div>
                    </div>
                  )}

                {/* 5. Admin Final Verification */}
                {user.role === 'super_admin' &&
                  ['Resolved', 'Ready for Review'].includes(ticket.status) && (
                    <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          Final IT Head Verification
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Sign off SLA compliance, parts cost, and close ticket as Completed.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAdminVerify}
                        className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                      >
                        <ShieldCheck className="w-4 h-4" /> Verify & Complete
                      </button>
                    </div>
                  )}
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  {data.comments.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500">No comments or external messages yet.</div>
                  ) : (
                    data.comments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-3.5 rounded-xl border text-sm ${
                          c.is_internal
                            ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/25 dark:border-amber-900'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {c.author_name} · {c.channel.toUpperCase()}
                            {c.is_internal ? ' (Internal Note)' : ''}
                          </span>
                          <span className="font-mono tabular-nums">
                            {new Date(c.created_at).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handlePostComment} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Channel:</span>
                    {(user.role === 'employee'
                      ? (['portal'] as const)
                      : (['portal', 'internal', 'outlook', 'whatsapp'] as const)
                    ).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setCommentChannel(ch)}
                        className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 border ${
                          commentChannel === ch
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ch === 'outlook' && <Mail className="w-3 h-3" />}
                        {ch === 'whatsapp' && <MessageSquare className="w-3 h-3" />}
                        <span className="capitalize">{ch === 'internal' ? 'Internal Note' : ch}</span>
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder={
                      commentChannel === 'internal'
                        ? 'Write an internal IT team note (hidden from employee)...'
                        : 'Write an update or reply...'
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> Post Message
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.attachments.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-xs text-slate-500">No files attached to this ticket.</div>
                ) : (
                  data.attachments.map((att) => {
                    const url = buildAuthFileUrl(`/api/attachments/${att.id}`);
                    return (
                      <div
                        key={att.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2"
                      >
                        {att.media_type === 'photo' && (
                          <img
                            src={url}
                            alt={att.file_name}
                            referrerPolicy="no-referrer"
                            className="w-full h-40 object-cover rounded-lg bg-slate-100 dark:bg-slate-950"
                          />
                        )}
                        {att.media_type === 'video' && (
                          <video src={url} controls className="w-full h-40 rounded-lg bg-black" />
                        )}
                        {att.media_type === 'document' && (
                          <div className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <FileText className="w-8 h-8 text-slate-400" />
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{att.file_name}</span>
                          </span>
                          <a
                            href={url}
                            download={att.file_name}
                            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Open
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-6">
                {/* Parts Replaced */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Parts Replaced & Direct Expenses</h3>
                    <span className="font-mono text-xs font-bold tabular-nums">
                      Total: INR {ticket.expenses_incurred.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {partsList.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                          <tr>
                            <th className="text-left px-3 py-2">Part Name</th>
                            <th className="text-left px-3 py-2">Serial</th>
                            <th className="text-right px-3 py-2">Qty</th>
                            <th className="text-right px-3 py-2">Cost (INR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {partsList.map((p, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-medium">{p.partName}</td>
                              <td className="px-3 py-2 font-mono">{p.serial || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">{p.quantity}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">{p.cost.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(user.role === 'moderator' || user.role === 'super_admin') && (
                    <form onSubmit={handleAddPart} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        required
                        value={partName}
                        onChange={(e) => setPartName(e.target.value)}
                        placeholder="Part name (e.g. Printhead)"
                        className="sm:col-span-2 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={partSerial}
                        onChange={(e) => setPartSerial(e.target.value)}
                        placeholder="Serial #"
                        className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={partCost}
                        onChange={(e) => setPartCost(e.target.value)}
                        placeholder="Cost INR"
                        className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Part
                      </button>
                    </form>
                  )}
                </div>

                {/* Time Logs */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Work Timer Logs</h3>
                  {data.timeLogs.length === 0 ? (
                    <p className="text-xs text-slate-500">No work timers logged yet.</p>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                          <tr>
                            <th className="text-left px-3 py-2">Technician</th>
                            <th className="text-left px-3 py-2">Work Type</th>
                            <th className="text-left px-3 py-2">Notes</th>
                            <th className="text-right px-3 py-2">Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {data.timeLogs.map((tl) => (
                            <tr key={tl.id}>
                              <td className="px-3 py-2 font-medium">{tl.moderator_name}</td>
                              <td className="px-3 py-2">{tl.work_type}</td>
                              <td className="px-3 py-2 text-slate-500">{tl.notes || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {tl.ended_at ? `${tl.duration_minutes} min` : 'Running...'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="space-y-3">
                {data.activities.map((act) => (
                  <div key={act.id} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{act.actor_name}</span>{' '}
                      <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400">{act.action}</span>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">{act.details}</div>
                    </div>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">
                      {new Date(act.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
