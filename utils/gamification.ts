// Gamification logic: XP, streaks, badges and level, all DERIVED from habits, habitDays and completions.
// Nothing here is stored, so it can't drift out of sync, and un-checking a completion removes its XP.
// Pure functions: no database, React or Firebase. Runs under Node's test runner, so only `import type` from '@/...'.
//
// Known limitation (accepted): habitDays holds only a habit's CURRENT schedule, so past dates are judged
// against today's schedule. Changing a habit's frequency can change past perfect days and streaks.
// Completion rows themselves are never changed. Fixing this would need a schedule history (a schema change).

import type {WeekdayKey} from '@/constants/habits';

export type GamiHabit = {
  habitId: string;
  createdDate: string; // local YYYY-MM-DD
  frequencyType: 'daily' | 'weekdays';
  days: WeekdayKey[]; // empty for daily habits
  deleted: boolean;
};

export type GamiCompletion = {habitId: string; date: string; completed: boolean};

export const XP_PER_COMPLETION = 10;
export const PERFECT_DAY_XP = 20;
export const STREAK_MILESTONES = [
  {days: 3, xp: 25},
  {days: 7, xp: 50},
  {days: 14, xp: 100},
  {days: 30, xp: 200},
  {days: 60, xp: 400},
  {days: 100, xp: 800},
] as const;

// ---------- Calendar arithmetic on YYYY-MM-DD strings ----------
// Dates are mapped to UTC day numbers only to step through the calendar. The current time is never read,
// so time zones and daylight saving can't shift a day. `today` always comes from getLocalDateString().

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS_BY_UTC_DAY: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // getUTCDay() order

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  const dt = new Date(n * DAY_MS);
  const pad = (v: number, len = 2) => String(v).padStart(len, '0');
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayOf(dayNumber: number): WeekdayKey {
  return WEEKDAYS_BY_UTC_DAY[new Date(dayNumber * DAY_MS).getUTCDay()];
}

function requireToday(today: string): void {
  if (!isDateString(today)) throw new Error(`today must be a local YYYY-MM-DD date, got "${today}"`);
}

// ---------- Scheduling ----------

function scheduledOn(habit: GamiHabit, date: string, weekday: WeekdayKey): boolean {
  if (habit.deleted || habit.createdDate > date) return false;
  return habit.frequencyType === 'daily' || habit.days.includes(weekday);
}

// Not deleted, created on or before `date`, and daily or due on that weekday
export function isScheduledOn(habit: GamiHabit, date: string): boolean {
  return scheduledOn(habit, date, weekdayOf(toDayNumber(date)));
}

// Valid completed rows up to and including today (future-dated rows are ignored everywhere)
function completedUpTo(completions: GamiCompletion[], today: string): GamiCompletion[] {
  return completions.filter((c) => c.completed === true && isDateString(c.date) && c.date <= today);
}

// First day of history: the earliest habit createdDate or completion date. null if there is none up to today.
function historyStart(habits: GamiHabit[], completions: GamiCompletion[], today: string): number | null {
  let start: string | null = null;
  for (const h of habits) {
    if (isDateString(h.createdDate) && (start === null || h.createdDate < start)) start = h.createdDate;
  }
  for (const c of completions) {
    if (isDateString(c.date) && (start === null || c.date < start)) start = c.date;
  }
  return start === null || start > today ? null : toDayNumber(start);
}

// ---------- Streaks ----------
// Overall: a day COUNTS if any completion that date is completed (deleted habits included).
// It BREAKS the streak only if an active habit was scheduled and nothing was completed, except today,
// which is still open. Days with nothing scheduled are skipped. So deleting a habit can never lower a streak.
// Per habit: the same rules on that habit's own scheduled days, for active habits only.

export function computeStreaks(habits: GamiHabit[], completions: GamiCompletion[], today: string): {
  currentStreak: number;
  longestStreak: number;
  perHabit: Record<string, number>;
} {
  requireToday(today);
  const done = completedUpTo(completions, today);
  const countedDates = new Set(done.map((c) => c.date));
  const doneKeys = new Set(done.map((c) => `${c.habitId}|${c.date}`));
  const active = habits.filter((h) => !h.deleted);

  const perHabit: Record<string, number> = {};
  for (const h of active) perHabit[h.habitId] = 0;

  const start = historyStart(habits, completions, today);
  if (start === null) return {currentStreak: 0, longestStreak: 0, perHabit};

  let run = 0;
  let longest = 0;
  const todayN = toDayNumber(today);
  for (let n = start; n <= todayN; n++) {
    const date = fromDayNumber(n);
    const weekday = weekdayOf(n);
    const isToday = n === todayN;

    if (countedDates.has(date)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (!isToday && active.some((h) => scheduledOn(h, date, weekday))) {
      run = 0;
    }

    for (const h of active) {
      if (!scheduledOn(h, date, weekday)) continue;
      if (doneKeys.has(`${h.habitId}|${date}`)) perHabit[h.habitId] += 1;
      else if (!isToday) perHabit[h.habitId] = 0;
    }
  }

  return {currentStreak: run, longestStreak: longest, perHabit};
}

// Each milestone reached by the LONGEST streak pays once
export function milestoneXp(longestStreak: number): number {
  return STREAK_MILESTONES.reduce((sum, m) => (longestStreak >= m.days ? sum + m.xp : sum), 0);
}

// Badge thresholds earned, e.g. [3, 7]
export function earnedBadges(longestStreak: number): number[] {
  return STREAK_MILESTONES.filter((m) => longestStreak >= m.days).map((m) => m.days);
}

// ---------- XP ----------

// Dates up to today where at least one active habit was scheduled and every scheduled one was completed
export function countPerfectDays(habits: GamiHabit[], completions: GamiCompletion[], today: string): number {
  requireToday(today);
  const doneKeys = new Set(completedUpTo(completions, today).map((c) => `${c.habitId}|${c.date}`));
  const active = habits.filter((h) => !h.deleted);
  const start = historyStart(habits, completions, today);
  if (start === null) return 0;

  let perfect = 0;
  const todayN = toDayNumber(today);
  for (let n = start; n <= todayN; n++) {
    const date = fromDayNumber(n);
    const weekday = weekdayOf(n);
    const scheduled = active.filter((h) => scheduledOn(h, date, weekday));
    if (scheduled.length > 0 && scheduled.every((h) => doneKeys.has(`${h.habitId}|${date}`))) perfect += 1;
  }
  return perfect;
}

// ---------- Level ----------
// Level n -> n+1 costs 50 * n XP. Reaching level L takes 25 * L * (L - 1) XP in total:
// level 1 at 0, level 2 at 50, level 3 at 150, level 4 at 300, level 5 at 500.

export function xpToReachLevel(level: number): number {
  return 25 * level * (level - 1);
}

// xpForNextLevel is the size of the current level (50 * level); progress = xpIntoLevel / xpForNextLevel (0..1)
export function levelFromXp(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
} {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  // closed-form estimate, then corrected in whole levels so float rounding can't misplace a boundary
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 25)) / 2));
  while (xpToReachLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpToReachLevel(level) > xp) level -= 1;

  const xpIntoLevel = xp - xpToReachLevel(level);
  const xpForNextLevel = 50 * level;
  return {level, xpIntoLevel, xpForNextLevel, progress: xpIntoLevel / xpForNextLevel};
}

// ---------- Events between two snapshots ----------

export type StatsEvents = {levelUp: boolean; newLevel: number; newBadges: number[]; perfectDay: boolean};

// What happened between two stats snapshots (e.g. before and after a tap). Un-checking yields no events.
export function diffStats(
  before: Pick<GamificationStats, 'level' | 'badges' | 'perfectDays'>,
  after: Pick<GamificationStats, 'level' | 'badges' | 'perfectDays'>,
): StatsEvents {
  return {
    levelUp: after.level > before.level,
    newLevel: after.level,
    newBadges: after.badges.filter((b) => !before.badges.includes(b)),
    perfectDay: after.perfectDays > before.perfectDays,
  };
}

// ---------- Everything together ----------

export type GamificationStats = {
  completionXp: number;
  perfectDays: number;
  perfectDayXp: number;
  milestoneXp: number;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  perHabitStreaks: Record<string, number>;
  badges: number[];
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
};

export function computeGamification(
  habits: GamiHabit[],
  completions: GamiCompletion[],
  today: string,
): GamificationStats {
  requireToday(today);
  // completed rows of deleted habits still earn their XP
  const completionXp = completedUpTo(completions, today).length * XP_PER_COMPLETION;
  const perfectDays = countPerfectDays(habits, completions, today);
  const perfectDayXp = perfectDays * PERFECT_DAY_XP;
  const streaks = computeStreaks(habits, completions, today);
  const bonusXp = milestoneXp(streaks.longestStreak);
  const totalXp = completionXp + perfectDayXp + bonusXp;

  return {
    completionXp,
    perfectDays,
    perfectDayXp,
    milestoneXp: bonusXp,
    totalXp,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    perHabitStreaks: streaks.perHabit,
    badges: earnedBadges(streaks.longestStreak),
    ...levelFromXp(totalXp),
  };
}
