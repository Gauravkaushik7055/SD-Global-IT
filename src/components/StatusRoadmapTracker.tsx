import { AlertTriangle, Check, PauseCircle, XCircle } from 'lucide-react';

const MAIN_STAGES = [
  'New',
  'Assigned',
  'Accepted',
  'Under Review',
  'In Progress',
  'Ready for Review',
  'Completed',
];

const SIDE_STATES = ['On Hold', 'Pending Information', 'Revision Required', 'Rejected', 'Resolved', 'Closed'];

export function StatusRoadmapTracker({
  status,
  timestamps,
}: {
  status: string;
  timestamps?: Partial<Record<string, string | null>>;
}) {
  const isSideState = SIDE_STATES.includes(status);
  const resolvedIndex =
    status === 'Resolved' || status === 'Closed'
      ? MAIN_STAGES.indexOf('Completed')
      : MAIN_STAGES.indexOf(status);

  const activeIdx = resolvedIndex >= 0 ? resolvedIndex : 3;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center min-w-[640px]">
          {MAIN_STAGES.map((stage, idx) => {
            const isCompleted = idx < activeIdx || (stage === 'Completed' && (status === 'Completed' || status === 'Closed'));
            const isCurrent = idx === activeIdx && !isSideState;
            const ts = timestamps?.[stage];

            return (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold border transition-colors ${
                      isCompleted
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span
                    className={`mt-1.5 text-[11px] font-medium whitespace-nowrap ${
                      isCurrent
                        ? 'text-blue-700 dark:text-blue-300 font-semibold'
                        : isCompleted
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {stage}
                  </span>
                  {ts && (
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
                {idx < MAIN_STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 -mt-5 ${
                      idx < activeIdx ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isSideState && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
            status === 'Rejected'
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-900 dark:text-red-200'
              : status === 'Resolved' || status === 'Closed'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-900 dark:text-amber-200'
          }`}
        >
          {status === 'Rejected' ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : status === 'On Hold' ? (
            <PauseCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>
            Current Workflow State: <strong>{status}</strong>
            {status === 'Resolved' && ' — Employee confirmed resolution; awaiting final IT Head verification.'}
            {status === 'Revision Required' && ' — Reopened by employee for additional technical work.'}
          </span>
        </div>
      )}
    </div>
  );
}
