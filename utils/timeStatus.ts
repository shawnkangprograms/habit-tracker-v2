// Time status of a Today row with a reminder time: has it been done on time, late, or is it overdue?
// Pure: no React or database imports. Everything is LOCAL time on the row's local date, built with the local
// Date constructor (never toISOString). Minute granularity: a habit due at 16:45 is on time through 16:45:59
// and overdue from 16:46:00. The status uses the habit's CURRENT reminder time.

import {getLocalDateString} from '@/utils/dates';

export type TimeStatus = 'none' | 'pending' | 'onTime' | 'late' | 'overdue';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE_MS = 60 * 1000;

// When the due minute ENDS (local), or null without a valid reminder time
function dueMinuteEnd(reminderTime: string | null, localDate: string): number | null {
  const m = reminderTime ? TIME_RE.exec(reminderTime) : null;
  if (!m) return null;
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day, Number(m[1]), Number(m[2])).getTime() + MINUTE_MS;
}

// completedAt: the completion's time (ms), or null if not completed. A time on another local date never
// counts (yesterday's tick is not today's). A stale list (now is on a later date) shows no status.
export function reminderTimeStatus(
  reminderTime: string | null,
  completedAt: number | null,
  nowMs: number,
  localDate: string,
): TimeStatus {
  const end = dueMinuteEnd(reminderTime, localDate);
  if (end === null || getLocalDateString(new Date(nowMs)) !== localDate) return 'none';
  const done = completedAt !== null && completedAt > 0 && getLocalDateString(new Date(completedAt)) === localDate;
  if (done) return completedAt < end ? 'onTime' : 'late';
  return nowMs >= end ? 'overdue' : 'pending';
}

export type StatusRow = {reminderTime: string | null; completed: number; completedAt: number};

// For one Home row. A checked row whose time is unknown (system row, or ticked on another date) shows no
// status, never "Overdue" on a checked row.
export function rowTimeStatus(row: StatusRow, nowMs: number, localDate: string): TimeStatus {
  if (row.completed !== 1) return reminderTimeStatus(row.reminderTime, null, nowMs, localDate);
  const status = reminderTimeStatus(row.reminderTime, row.completedAt, nowMs, localDate);
  return status === 'onTime' || status === 'late' ? status : 'none';
}

// The next moment any row's status can change on its own: the earliest due minute end still ahead among
// unchecked timed rows, or the next local midnight, whichever is first. One timeout for Home.
export function nextStatusChangeAt(rows: StatusRow[], nowMs: number, localDate: string): number {
  const now = new Date(nowMs);
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();// next local midnight
  for (const row of rows) {
    if (row.completed === 1) continue;
    const end = dueMinuteEnd(row.reminderTime, localDate);
    if (end !== null && end > nowMs && end < next) next = end;
  }
  return next;
}
