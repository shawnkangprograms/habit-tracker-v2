// The generateInsight request, built from the Summary maths (utils/summary.ts) over the last 30 days.
// Pure: no database, React or Firebase. Runs under Node's test runner.
//
// It must pass functions/src/validateInput.js exactly (a test runs every built request through it):
// {v: 1, trackedDays: 3..30, streak: 0..3650, bestWeekday: 'mon'..'sun' | null,
//  habits: 1..10 x {icon, freq, daysPerWeek, done, scheduled}}
// Habit names never leave the phone: the request type has no field that could carry one.
//
// - trackedDays: past days in the 30-day window (today is open, so it is left out) with any habit scheduled.
// - habits: the window's per-habit counts (summary rules: today counts only once done). Habits with nothing
//   counted yet, an icon outside ICON_IDS, or a weekday schedule with no days are skipped. Ranked by scheduled
//   days (most first), then icon id, then habitId; the first MAX_HABITS are sent.
// - bestWeekday: the weekday with the single highest done/scheduled share over past days in the window; null on
//   a tie, a top share of 0, or fewer than BEST_WEEKDAY_MIN_DAYS tracked days (too little data to mean anything).

import {ICON_IDS, type IconId, type WeekdayKey} from '@/constants/habits';
import type {Summary, SummaryHabit} from '@/utils/summary';

export const MIN_TRACKED_DAYS = 3;
export const MAX_HABITS = 10;
export const MAX_STREAK = 3650;
export const BEST_WEEKDAY_MIN_DAYS = 7;

export type InsightHabitInput = {
  icon: IconId;
  freq: 'daily' | 'weekdays';
  daysPerWeek: number;
  done: number;
  scheduled: number;
};

export type InsightRequest = {
  v: 1;
  trackedDays: number;
  streak: number;
  bestWeekday: WeekdayKey | null;
  habits: InsightHabitInput[];
};

export type InsightInputResult =
  | {ok: true; request: InsightRequest}
  | {ok: false; reason: 'notEnoughData' | 'noHabits'};

const ICONS = new Set<string>(ICON_IDS);

function isIconId(value: string): value is IconId {
  return ICONS.has(value);
}

// Highest share first; exact comparison of done/scheduled pairs (no floats)
function bestWeekdayOf(days: Summary['month']['days']): WeekdayKey | null {
  const totals = new Map<WeekdayKey, {done: number; scheduled: number}>();
  for (const d of days) {
    if (d.isToday || d.scheduled === 0) continue;
    const t = totals.get(d.weekday) ?? {done: 0, scheduled: 0};
    t.done += d.done;
    t.scheduled += d.scheduled;
    totals.set(d.weekday, t);
  }
  let best: WeekdayKey | null = null;
  let tied = false;
  let top = {done: 0, scheduled: 1};
  for (const [weekday, t] of totals) {
    const diff = t.done * top.scheduled - top.done * t.scheduled;
    if (best === null || diff > 0) {
      best = weekday;
      top = t;
      tied = false;
    } else if (diff === 0) {
      tied = true;
    }
  }
  if (best === null || tied || top.done === 0) return null;
  return best;
}

function byScheduledDesc(a: InsightHabitInput & {habitId: string}, b: InsightHabitInput & {habitId: string}): number {
  if (a.scheduled !== b.scheduled) return b.scheduled - a.scheduled;
  if (a.icon !== b.icon) return a.icon < b.icon ? -1 : 1;
  return a.habitId < b.habitId ? -1 : a.habitId > b.habitId ? 1 : 0;
}

// `summary` from computeSummary(habits, completions, today); `habits` the same rows (for each habit's schedule)
export function buildInsightInput(summary: Summary, habits: SummaryHabit[]): InsightInputResult {
  const month = summary.month;
  const pastDays = month.days.filter((d) => !d.isToday);
  const trackedDays = pastDays.filter((d) => d.scheduled > 0).length;
  if (trackedDays < MIN_TRACKED_DAYS) return {ok: false, reason: 'notEnoughData'};

  const byId = new Map(habits.map((h) => [h.habitId, h]));
  const candidates: (InsightHabitInput & {habitId: string})[] = [];
  for (const rate of month.habits) {
    const habit = byId.get(rate.habitId);
    if (!habit || habit.deleted || rate.scheduled < 1 || !isIconId(rate.icon)) continue;
    const daysPerWeek = habit.frequencyType === 'daily' ? 7 : new Set(habit.days).size;
    if (daysPerWeek < 1 || daysPerWeek > 7) continue;
    candidates.push({
      habitId: rate.habitId,
      icon: rate.icon,
      freq: habit.frequencyType === 'daily' ? 'daily' : 'weekdays',
      daysPerWeek,
      done: Math.min(rate.done, rate.scheduled),
      scheduled: Math.min(rate.scheduled, 30),
    });
  }
  if (candidates.length === 0) return {ok: false, reason: 'noHabits'};

  const sent = candidates.sort(byScheduledDesc).slice(0, MAX_HABITS)
    .map(({icon, freq, daysPerWeek, done, scheduled}) => ({icon, freq, daysPerWeek, done, scheduled}));// habitId stays on the phone

  return {
    ok: true,
    request: {
      v: 1,
      trackedDays: Math.min(trackedDays, 30),
      streak: Math.min(Math.max(0, summary.currentStreak), MAX_STREAK),
      bestWeekday: trackedDays >= BEST_WEEKDAY_MIN_DAYS ? bestWeekdayOf(month.days) : null,
      habits: sent,
    },
  };
}
