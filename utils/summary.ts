// Summary tab maths: per-day shares, range totals, perfect days, per-habit rates and the "Best this range" pick,
// all DERIVED from habits, habitDays and completions (db/gamificationCore.js getUserRows). Nothing is stored.
// Pure functions: no database, React or Firebase. Runs under Node's test runner.
//
// Rules (shared with utils/gamification.ts, which this module reuses rather than copies):
// - Scheduling is isScheduledOn: not deleted, created on or before the date, daily or due that weekday.
//   Past days are judged against the CURRENT schedule (the accepted limitation noted in gamification.ts).
// - Deleted habits are never scheduled, so they are left out of every count and the per-habit list.
//   Their completed rows still count for the streak, exactly as on Profile (computeStreaks).
// - A completion counts only on a day its habit was scheduled, so done <= scheduled and rates never pass 100%.
// - Today is open: in rates and totals, today's completed habits count in both done and scheduled, its
//   unfinished ones are left out. Today's day entry still shows every habit due today (live progress).
// - Perfect day: at least one habit scheduled and all of them done (countPerfectDays' rule; today only once
//   everything due today is done).

import type {WeekdayKey} from '@/constants/habits';
import {
  computeStreaks, fromDayNumber, isDateString, isScheduledOn, requireToday, toDayNumber, weekdayOf,
  type GamiCompletion, type GamiHabit,
} from '@/utils/gamification';

export type SummaryRange = 'week' | 'month';

export const RANGE_DAYS: Record<SummaryRange, number> = {week: 7, month: 30};

// A habit needs at least this many counted scheduled days in the range to be "Best this range"
export const BEST_MIN_DAYS = 3;

const MONDAY_FIRST: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // heat strip columns

export type SummaryHabit = GamiHabit & {habitName: string; icon: string};

export type SummaryDay = {
  date: string; // local YYYY-MM-DD
  weekday: WeekdayKey;
  isToday: boolean;
  scheduled: number; // habits due that day; for today, finished or not
  done: number;
  share: number | null; // done / scheduled; null when nothing was scheduled (not a miss)
  perfect: boolean;
};

export type HabitRate = {
  habitId: string;
  habitName: string;
  icon: string;
  done: number;
  scheduled: number; // counted days: today only if done
  rate: number | null; // null when no counted day in the range
  best: boolean;
};

export type RangeSummary = {
  range: SummaryRange;
  startDate: string;
  endDate: string; // today
  days: SummaryDay[]; // oldest first, ending today
  leadingBlanks: number; // empty cells before days[0] in a Monday-first 7-column grid
  done: number;
  scheduled: number;
  rate: number | null; // done / scheduled
  perfectDays: number;
  habits: HabitRate[]; // highest rate first; habits with no counted day last
  bestHabitId: string | null;
  empty: 'noHabits' | 'nothingScheduled' | null; // what the empty state should say, or null to show the range
};

export type Summary = {
  today: string;
  currentStreak: number; // the overall streak, as on Profile; may start before either range
  week: RangeSummary;
  month: RangeSummary;
};

// a.done / a.scheduled compared with b.done / b.scheduled, exactly (no floats). Both need scheduled > 0.
function compareRates(a: HabitRate, b: HabitRate): number {
  return a.done * b.scheduled - b.done * a.scheduled;
}

// Highest rate first, then more counted days, then name and id (so the order is stable)
function byRateDesc(a: HabitRate, b: HabitRate): number {
  if ((a.scheduled === 0) !== (b.scheduled === 0)) return a.scheduled === 0 ? 1 : -1;
  if (a.scheduled > 0) {
    const diff = compareRates(b, a);
    if (diff !== 0) return diff;
    if (a.scheduled !== b.scheduled) return b.scheduled - a.scheduled;
  }
  const an = a.habitName.toLowerCase();
  const bn = b.habitName.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.habitId < b.habitId ? -1 : a.habitId > b.habitId ? 1 : 0;
}

// The unique top rate among habits with at least BEST_MIN_DAYS counted days. A tie there means no pick;
// habits with fewer days neither win nor block. A top rate of 0 is no "best".
function pickBest(rates: HabitRate[]): string | null {
  const eligible = rates.filter((h) => h.scheduled >= BEST_MIN_DAYS);
  if (eligible.length === 0) return null;
  let top = eligible[0];
  for (const h of eligible) if (compareRates(h, top) > 0) top = h;
  if (top.done === 0) return null;
  const tied = eligible.filter((h) => compareRates(h, top) === 0);
  return tied.length === 1 ? top.habitId : null;
}

function summariseRange(
  range: SummaryRange,
  active: SummaryHabit[],
  doneKeys: Set<string>,
  today: string,
): RangeSummary {
  const todayN = toDayNumber(today);
  const startN = todayN - RANGE_DAYS[range] + 1;

  const perHabit = new Map<string, {done: number; scheduled: number}>();
  for (const h of active) perHabit.set(h.habitId, {done: 0, scheduled: 0});

  const days: SummaryDay[] = [];
  let done = 0;
  let scheduled = 0;
  let perfectDays = 0;

  for (let n = startN; n <= todayN; n++) {
    const date = fromDayNumber(n);
    const isToday = n === todayN;
    let dayScheduled = 0;
    let dayDone = 0;

    for (const h of active) {
      if (!isScheduledOn(h, date)) continue;
      const isDone = doneKeys.has(`${h.habitId}|${date}`);
      dayScheduled += 1;
      if (isDone) dayDone += 1;
      if (isToday && !isDone) continue; // today is open: unfinished habits don't count yet
      const counts = perHabit.get(h.habitId)!;
      counts.scheduled += 1;
      scheduled += 1;
      if (isDone) {
        counts.done += 1;
        done += 1;
      }
    }

    const perfect = dayScheduled > 0 && dayDone === dayScheduled;
    if (perfect) perfectDays += 1;
    days.push({
      date,
      weekday: weekdayOf(n),
      isToday,
      scheduled: dayScheduled,
      done: dayDone,
      share: dayScheduled > 0 ? dayDone / dayScheduled : null,
      perfect,
    });
  }

  const rates: HabitRate[] = active.map((h) => {
    const counts = perHabit.get(h.habitId)!;
    return {
      habitId: h.habitId,
      habitName: h.habitName,
      icon: h.icon,
      done: counts.done,
      scheduled: counts.scheduled,
      rate: counts.scheduled > 0 ? counts.done / counts.scheduled : null,
      best: false,
    };
  });
  const bestHabitId = pickBest(rates);
  const habits = rates
    .map((h) => (h.habitId === bestHabitId ? {...h, best: true} : h))
    .sort(byRateDesc);

  let empty: RangeSummary['empty'] = null;
  if (active.length === 0) empty = 'noHabits';
  else if (days.every((d) => d.scheduled === 0)) empty = 'nothingScheduled';

  return {
    range,
    startDate: days[0].date,
    endDate: today,
    days,
    leadingBlanks: MONDAY_FIRST.indexOf(days[0].weekday),
    done,
    scheduled,
    rate: scheduled > 0 ? done / scheduled : null,
    perfectDays,
    habits,
    bestHabitId,
    empty,
  };
}

// Everything the Summary tab shows, for both ranges at once (so switching ranges recomputes nothing).
// `habits` includes deleted ones (flagged), like computeGamification; `today` comes from getLocalDateString().
export function computeSummary(habits: SummaryHabit[], completions: GamiCompletion[], today: string): Summary {
  requireToday(today);
  const active = habits.filter((h) => !h.deleted);
  // valid completed rows up to today; future-dated rows are ignored, as everywhere else
  const doneKeys = new Set(
    completions
      .filter((c) => c.completed === true && isDateString(c.date) && c.date <= today)
      .map((c) => `${c.habitId}|${c.date}`),
  );
  return {
    today,
    currentStreak: computeStreaks(habits, completions, today).currentStreak,
    week: summariseRange('week', active, doneKeys, today),
    month: summariseRange('month', active, doneKeys, today),
  };
}
