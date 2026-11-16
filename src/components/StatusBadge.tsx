import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';

export function PriorityTag({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    Critical: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/70',
    High: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70',
    Medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/70',
    Low: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap ${
        styles[priority] || styles.Medium
      }`}
    >
      {priority === 'Critical' && <AlertCircle className="w-3 h-3 shrink-0" />}
      {priority === 'High' && <AlertTriangle className="w-3 h-3 shrink-0" />}
      <span>{priority}</span>
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: typeof Clock }> = {
    New: {
      cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900/70',
      icon: Clock,
    },
    Assigned: {
      cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900/70',
      icon: Clock,
    },
    Accepted: {
      cls: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-900/70',
      icon: CheckCircle2,
    },
    'Under Review': {
      cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/70',
      icon: Clock,
    },
    'In Progress': {
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70',
      icon: Wrench,
    },
    'On Hold': {
      cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      icon: PauseCircle,
    },
    'Pending Information': {
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70',
      icon: AlertTriangle,
    },
    'Ready for Review': {
      cls: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900/70',
      icon: CheckCircle2,
    },
    'Revision Required': {
      cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900/70',
      icon: AlertTriangle,
    },
    Rejected: {
      cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/70',
      icon: XCircle,
    },
    Resolved: {
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/70',
      icon: CheckCircle2,
    },
    Completed: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      icon: ShieldCheck,
    },
    Closed: {
      cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      icon: CheckCircle2,
    },
    Approved: {
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/70',
      icon: CheckCircle2,
    },
    Pending: {
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70',
      icon: Clock,
    },
    Operational: {
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/70',
      icon: CheckCircle2,
    },
    'Under Repair': {
      cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70',
      icon: Wrench,
    },
    Spare: {
      cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/70',
      icon: Clock,
    },
    Decommissioned: {
      cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      icon: XCircle,
    },
  };

  const cfg = map[status] || {
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    icon: Clock,
  };
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap ${cfg.cls}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{status}</span>
    </span>
  );
}
