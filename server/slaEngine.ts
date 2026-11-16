import { db } from './db.ts';
import { createAndPushNotification, notifyAdmins } from './ws.ts';

interface SlaConfigRow {
  priority: string;
  first_response_minutes: number;
  resolution_hours: number;
  work_start_hour: number;
  work_end_hour: number;
  working_days: string;
  holidays: string;
  auto_escalate: number;
  escalation_email: string;
}

function addBusinessMinutes(startDate: Date, minutesToAdd: number, config: SlaConfigRow): Date {
  // If 24x7 or all days active with full 24h window, add directly
  let workingDays: number[] = [0, 1, 2, 3, 4, 5, 6];
  let holidays: string[] = [];
  try {
    workingDays = JSON.parse(config.working_days || '[1,2,3,4,5,6]');
    holidays = JSON.parse(config.holidays || '[]');
  } catch {
    workingDays = [1, 2, 3, 4, 5, 6];
  }

  const startHr = config.work_start_hour ?? 9;
  const endHr = config.work_end_hour ?? 21;
  if (workingDays.length === 7 && startHr === 0 && endHr === 24 && holidays.length === 0) {
    return new Date(startDate.getTime() + minutesToAdd * 60000);
  }

  let remaining = minutesToAdd;
  const cursor = new Date(startDate.getTime());
  let safetyCounter = 0;

  while (remaining > 0 && safetyCounter < 60 * 24 * 60) {
    safetyCounter++;
    const dayStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getDay();
    const hour = cursor.getHours();

    if (workingDays.includes(dayOfWeek) && !holidays.includes(dayStr) && hour >= startHr && hour < endHr) {
      remaining--;
    }
    cursor.setTime(cursor.getTime() + 60000);
  }

  return cursor;
}

export function computeSlaDueDates(priority: string, createdAt = new Date()): {
  firstResponseDueAt: string;
  resolutionDueAt: string;
} {
  const cfg = db.prepare('SELECT * FROM sla_configs WHERE priority = ?').get(priority) as SlaConfigRow | undefined;
  const fallback: SlaConfigRow = {
    priority,
    first_response_minutes: priority === 'Critical' ? 15 : priority === 'High' ? 30 : priority === 'Medium' ? 240 : 480,
    resolution_hours: priority === 'Critical' ? 4 : priority === 'High' ? 8 : priority === 'Medium' ? 24 : 48,
    work_start_hour: 9,
    work_end_hour: 20,
    working_days: '[1,2,3,4,5,6]',
    holidays: '[]',
    auto_escalate: 1,
    escalation_email: 'ithead@sdgloballogistics.com',
  };

  const active = cfg || fallback;
  const firstDue = addBusinessMinutes(createdAt, active.first_response_minutes, active);
  const resDue = addBusinessMinutes(createdAt, active.resolution_hours * 60, active);

  return {
    firstResponseDueAt: firstDue.toISOString(),
    resolutionDueAt: resDue.toISOString(),
  };
}

let slaTimer: NodeJS.Timeout | null = null;

export function runSlaBreachCheck(): void {
  const nowIso = new Date().toISOString();
  const overdueTickets = db
    .prepare(
      `SELECT id, ticket_number, priority, assigned_moderator_id, reporter_branch, resolution_due_at
       FROM tickets
       WHERE sla_breached = 0
         AND status NOT IN ('Completed', 'Resolved', 'Closed', 'Rejected')
         AND resolution_due_at IS NOT NULL
         AND resolution_due_at < ?`
    )
    .all(nowIso) as {
    id: number;
    ticket_number: string;
    priority: string;
    assigned_moderator_id: number | null;
    reporter_branch: string;
    resolution_due_at: string;
  }[];

  if (overdueTickets.length === 0) return;

  const markBreached = db.prepare(
    `UPDATE tickets SET sla_breached = 1, sla_breached_at = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const logActivity = db.prepare(
    `INSERT INTO ticket_activities (ticket_id, actor_id, actor_name, action, details)
     VALUES (?, NULL, 'SLA Engine', 'SLA_BREACHED', ?)`
  );

  for (const ticket of overdueTickets) {
    markBreached.run(nowIso, ticket.id);
    logActivity.run(
      ticket.id,
      `${ticket.priority} SLA resolution deadline (${ticket.resolution_due_at}) exceeded.`
    );

    notifyAdmins({
      type: 'critical',
      title: `SLA Breached: ${ticket.ticket_number}`,
      message: `${ticket.priority} ticket at ${ticket.reporter_branch || 'Hub'} exceeded resolution target.`,
      linkType: 'ticket',
      linkId: ticket.id,
    });

    if (ticket.assigned_moderator_id) {
      createAndPushNotification({
        userId: ticket.assigned_moderator_id,
        type: 'critical',
        title: `SLA Overdue: ${ticket.ticket_number}`,
        message: `Assigned ${ticket.priority} ticket has breached its resolution SLA.`,
        linkType: 'ticket',
        linkId: ticket.id,
      });
    }
  }
}

export function startSlaEngine(): void {
  runSlaBreachCheck();
  if (slaTimer) clearInterval(slaTimer);
  slaTimer = setInterval(runSlaBreachCheck, 60000);
}
