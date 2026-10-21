// Which local notifications should be scheduled right now: habit reminders and the evening nudge, for today
// and the next 2 days, as one-off notifications. Pure: no React, database or native API. The applier
// (services/notificationApplier.ts) diffs this list against what is scheduled.
//
// Local dates and times only: every fire time is built with the local Date constructor
// (new Date(y, m, d, hh, mm)), never from toISOString, so it follows the phone's current time zone and DST.
// The schedule is rebuilt on every foreground, so a changed time zone is picked up then.

import {WEEKDAY_KEYS, type WeekdayKey} from '@/constants/habits';
import {getLocalDateString} from '@/utils/dates';
import type {NotificationPrefs} from '@/utils/notificationPrefs';

export const WINDOW_DAYS = 3;// today + the next 2 days
export const MAX_SCHEDULED = 60;// iOS keeps at most 64; leave room
export const NUDGE_EARLIEST = '08:00';
export const NUDGE_LATEST = '21:30';
export const STREAK_NUDGE_MIN = 3;

export type ScheduleHabit = {
  habitId: string;
  habitName: string;
  frequencyType: 'daily' | 'weekdays';
  days: WeekdayKey[];// empty for daily habits
  reminderTime: string | null;// HH:MM (24 h) or null
};

export type PlannedNotification = {
  id: string;// deterministic: "hq:habit:<habitId>:<YYYY-MM-DD>" or "hq:nudge:<YYYY-MM-DD>"
  fireAt: number;// ms
  title: string;
  body: string;
  kind: 'habit' | 'nudge';
};

export const ID_PREFIX = 'hq:';

// ---------- Copy (no exclamation marks, no guilt) ----------

export const REMINDER_BODIES = [
  'A good time for this one.',
  'Ready when you are.',
  "Time for today's check-in.",
] as const;

export const NUDGE_TITLE = 'HabitQuest';

export const NUDGE_DEFAULT = [
  "A few habits are still open today. There's still time.",
  "Some of today's habits are still waiting. There's time to finish.",
  "Your day isn't over yet. A habit or two is still open.",
  "Still time for today's habits. They'll be there when you're ready.",
] as const;

// Only when NOTHING is done today: in the engine any completed habit keeps the day in the streak
export const NUDGE_STREAK = [
  (n: number) => `Your ${n}-day streak is still alive. Finishing today keeps it going.`,
  (n: number) => `${n} days in a row. One habit today keeps the streak going.`,
  (n: number) => `Your streak is at ${n} days. Any habit today keeps it alive.`,
] as const;

export const NUDGE_ONE_LEFT = [
  'Just one habit left today.',
  'One habit to go for today.',
  'Only one habit is still open today.',
  'One more and today is complete.',
] as const;

// ---------- Helpers ----------

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function minutesOf(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// The nudge time, kept inside quiet hours (never before 08:00 or after 21:30)
export function clampNudgeMinutes(time: string): number {
  const earliest = minutesOf(NUDGE_EARLIEST)!;
  const latest = minutesOf(NUDGE_LATEST)!;
  const minutes = minutesOf(time) ?? minutesOf('20:30')!;
  return Math.min(latest, Math.max(earliest, minutes));
}

function isScheduledOn(habit: ScheduleHabit, weekday: WeekdayKey): boolean {
  return habit.frequencyType === 'daily' || habit.days.includes(weekday);
}

type Day = {offset: number; date: string; weekday: WeekdayKey; dayNumber: number; at: (minutes: number) => number};

function windowDays(now: Date): Day[] {
  const days: Day[] = [];
  for (let offset = 0; offset < WINDOW_DAYS; offset++) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate() + offset;// the Date constructor rolls over month/year ends
    const local = new Date(y, m, d);
    days.push({
      offset,
      date: getLocalDateString(local),
      weekday: WEEKDAY_KEYS[local.getDay()],
      dayNumber: Math.round(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS),
      at: (minutes) => new Date(y, m, d, Math.floor(minutes / 60), minutes % 60).getTime(),
    });
  }
  return days;
}

// One candidate before wording: a bank of texts and a preferred (stable) variant
type Candidate = Omit<PlannedNotification, 'body'> & {bank: readonly string[]; preferred: number};

// ---------- The schedule ----------

export function buildSchedule(
  habits: ScheduleHabit[],
  completionsToday: ReadonlySet<string>,// habitIds completed today
  prefs: NotificationPrefs,
  now: Date,
  currentStreak: number | null,// from the stats store; null if unknown (then no streak wording)
): PlannedNotification[] {
  const nowMs = now.getTime();
  const candidates: Candidate[] = [];

  for (const day of windowDays(now)) {
    const scheduled = habits.filter((h) => isScheduledOn(h, day.weekday));

    if (prefs.remindersOn) {
      const reminders = scheduled
        .map((habit) => ({habit, minutes: habit.reminderTime ? minutesOf(habit.reminderTime) : null}))
        .filter((r): r is {habit: ScheduleHabit; minutes: number} => r.minutes !== null)
        .filter((r) => !(day.offset === 0 && completionsToday.has(r.habit.habitId)))// done today: skip today's
        .map((r) => ({...r, fireAt: day.at(r.minutes)}))
        .filter((r) => r.fireAt > nowMs)
        .sort((a, b) => a.fireAt - b.fireAt || a.habit.habitId.localeCompare(b.habit.habitId));
      // rank counted from the day's LAST reminder: ticking (removing) an earlier one never rewords later ones
      reminders.forEach((r, i) => candidates.push({
        id: `${ID_PREFIX}habit:${r.habit.habitId}:${day.date}`,
        fireAt: r.fireAt,
        title: r.habit.habitName,
        kind: 'habit',
        bank: REMINDER_BODIES,
        preferred: day.dayNumber + (reminders.length - 1 - i),
      }));
    }

    if (prefs.nudgeOn && scheduled.length > 0) {
      const fireAt = day.at(clampNudgeMinutes(prefs.nudgeTime));
      if (fireAt <= nowMs) continue;
      let bank: readonly string[] = NUDGE_DEFAULT;// future days: their state isn't known yet
      if (day.offset === 0) {
        const open = scheduled.filter((h) => !completionsToday.has(h.habitId)).length;
        if (open === 0) continue;// all done: no nudge today
        const doneCount = scheduled.length - open;
        if (doneCount === 0 && currentStreak !== null && currentStreak >= STREAK_NUDGE_MIN) {
          bank = NUDGE_STREAK.map((text) => text(currentStreak));
        } else if (open === 1) {
          bank = NUDGE_ONE_LEFT;
        }
      }
      candidates.push({
        id: `${ID_PREFIX}nudge:${day.date}`, fireAt, title: NUDGE_TITLE, kind: 'nudge', bank, preferred: day.dayNumber,
      });
    }
  }

  // soonest first; past the cap, the farthest are dropped
  candidates.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  return assignBodies(candidates.slice(0, MAX_SCHEDULED));
}

// Each item keeps its preferred wording (stable, so a small change only rewords its neighbours), but never
// the same text as the notification just before it
function assignBodies(candidates: Candidate[]): PlannedNotification[] {
  let previous: string | null = null;
  return candidates.map(({bank, preferred, ...rest}) => {
    let body = bank[preferred % bank.length];
    for (let k = 1; body === previous && k < bank.length; k++) body = bank[(preferred + k) % bank.length];
    previous = body;
    return {...rest, body};
  });
}
