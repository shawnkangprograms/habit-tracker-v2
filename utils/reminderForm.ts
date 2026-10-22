// Reminder section of the habit form. Pure: no React or native imports. The stored value is always the
// "HH:MM" string the validators check; the time picker's Date is only a view of it, read with the LOCAL
// getHours/getMinutes (never toISOString).

import {getLocalWeekdayKey} from '@/utils/dates';
import type {Frequency, RemindBeforeMin} from '@/constants/habits';

export const DEFAULT_REMINDER_TIME = '09:00';

// "Heads-up" chips: an extra quiet notification before the due-time reminder (which always comes)
export const LEAD_LABELS: Record<RemindBeforeMin, string> = {
  0: 'None',
  5: '5 min before',
  10: '10 min before',
  15: '15 min before',
  30: '30 min before',
  60: '1 hour before',
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE_MS = 60 * 1000;

// "HH:MM" as a Date on a fixed day (the picker only uses the clock part); an invalid time shows 09:00
export function timeToDate(time: string): Date {
  const m = TIME_RE.exec(time) ?? TIME_RE.exec(DEFAULT_REMINDER_TIME)!;
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
}

// The picker's Date as "HH:MM" (local clock)
export function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// The muted line under the Heads-up chips, for a habit due today (real Date values, as the scheduler):
// - the due time has passed: the due-time reminder starts tomorrow ("Starts from tomorrow."), lead 0 included
// - only the heads-up time (due minus lead) has passed: today's heads-up is gone, the due-time one still comes
// - otherwise, or not due today, or no time: no line
export type TimingNote = 'startsTomorrow' | 'headsUpPassed' | null;

export function reminderTimingNote(input: {
  reminderTime: string | null;
  remindBeforeMin: number;
  frequency: Frequency;
  now: Date;
}): TimingNote {
  const m = input.reminderTime ? TIME_RE.exec(input.reminderTime) : null;
  if (!m) return null;
  const {now, frequency} = input;
  if (frequency.type === 'weekdays' && !frequency.days.includes(getLocalWeekdayKey(now))) return null;
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2])).getTime();
  if (due <= now.getTime()) return 'startsTomorrow';
  if (input.remindBeforeMin > 0 && due - input.remindBeforeMin * MINUTE_MS <= now.getTime()) return 'headsUpPassed';
  return null;
}

export function timingNoteText(note: TimingNote, reminderTime: string): string | null {
  if (note === 'startsTomorrow') return 'Starts from tomorrow.';
  if (note === 'headsUpPassed') return `Today's heads-up has passed. The reminder at ${reminderTime} still comes today.`;
  return null;
}
