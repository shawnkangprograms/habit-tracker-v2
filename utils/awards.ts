// The awards (C4): 35 of them in eight groups, all DERIVED on every stats load from the synced habits and
// completions only (never reflections, packs, the on-phone area map or the time of a tick), so every phone shows
// the same ones and nothing is stored or synced. The rules are written out in docs/HABITQUEST_DESIGN.md (C4, "The
// rules"); tests/awards.test.ts holds a boundary fixture for each. New awards give no XP: the six streak medals keep
// their XP in utils/gamification.ts (STREAK_MILESTONES) and nothing here changes it. Pure.
//
// Ids are lower-case ASCII (letters, digits, _), at most 32 characters, never changed or reused. The six streak
// medals are streak_3 .. streak_100; their celebration stays the overlay under the old `streak:N` keys
// (utils/celebrations.ts). Every other award is celebrated with one toast under `award:<id>` (wired in C4 Set 3).

import {clampCreatedDates, computeStreaks, countPerfectDays, fromDayNumber, isDateString, requireToday, toDayNumber, weekdayOf,
  type GamiCompletion} from '@/utils/gamification';
import type {WeekdayKey} from '@/constants/habits';
import type {MedalTier} from '@/utils/medals';
import {iconArea} from '@/utils/radar/areas';
import type {RadarHabit} from '@/utils/radar/score';

export const AWARD_GROUPS = ['streaks', 'perfect', 'volume', 'consistency', 'comebacks', 'mastery', 'variety', 'time'] as const;
export type AwardGroup = (typeof AWARD_GROUPS)[number];

// A second flame (200 days) or a laurel (365) on the blaze material, drawn in Set 2
export type AwardOrnament = 'none' | 'secondFlame' | 'laurel';

export type AwardRule =
  | {kind: 'longestStreak'; n: number}
  | {kind: 'perfectDays'; n: number}
  | {kind: 'perfectRun'; n: number}
  | {kind: 'ticks'; n: number}
  | {kind: 'steady'; days: number; minScheduled: number}
  | {kind: 'neverTwice'}
  | {kind: 'weekend'}
  | {kind: 'comeback'}
  | {kind: 'habitStreak'; n: number}
  | {kind: 'activeHabits'; n: number}
  | {kind: 'areas'; n: number}
  | {kind: 'daysSince'; n: number};

const def = <const I extends string>(id: I, group: AwardGroup, tier: MedalTier, rule: AwardRule, ornament: AwardOrnament = 'none') =>
  ({id, group, tier, ornament, rule});

export const AWARDS = [
  def('streak_3', 'streaks', 'bronze', {kind: 'longestStreak', n: 3}),
  def('streak_7', 'streaks', 'silver', {kind: 'longestStreak', n: 7}),
  def('streak_14', 'streaks', 'gold', {kind: 'longestStreak', n: 14}),
  def('streak_30', 'streaks', 'emerald', {kind: 'longestStreak', n: 30}),
  def('streak_60', 'streaks', 'ruby', {kind: 'longestStreak', n: 60}),
  def('streak_100', 'streaks', 'blaze', {kind: 'longestStreak', n: 100}),
  def('streak_200', 'streaks', 'blaze', {kind: 'longestStreak', n: 200}, 'secondFlame'),
  def('streak_365', 'streaks', 'blaze', {kind: 'longestStreak', n: 365}, 'laurel'),
  def('perfect_1', 'perfect', 'bronze', {kind: 'perfectDays', n: 1}),
  def('perfect_7', 'perfect', 'silver', {kind: 'perfectDays', n: 7}),
  def('perfect_30', 'perfect', 'gold', {kind: 'perfectDays', n: 30}),
  def('perfect_100', 'perfect', 'emerald', {kind: 'perfectDays', n: 100}),
  def('perfect_run_3', 'perfect', 'silver', {kind: 'perfectRun', n: 3}),
  def('perfect_run_7', 'perfect', 'gold', {kind: 'perfectRun', n: 7}),
  def('done_10', 'volume', 'bronze', {kind: 'ticks', n: 10}),
  def('done_50', 'volume', 'silver', {kind: 'ticks', n: 50}),
  def('done_100', 'volume', 'gold', {kind: 'ticks', n: 100}),
  def('done_250', 'volume', 'emerald', {kind: 'ticks', n: 250}),
  def('done_500', 'volume', 'ruby', {kind: 'ticks', n: 500}),
  def('done_1000', 'volume', 'blaze', {kind: 'ticks', n: 1000}),
  def('weekend_done', 'consistency', 'bronze', {kind: 'weekend'}),
  def('steady_week', 'consistency', 'silver', {kind: 'steady', days: 7, minScheduled: 7}),
  def('steady_month', 'consistency', 'gold', {kind: 'steady', days: 30, minScheduled: 30}),
  def('never_twice', 'consistency', 'emerald', {kind: 'neverTwice'}),
  def('comeback', 'comebacks', 'bronze', {kind: 'comeback'}),
  def('habit_streak_7', 'mastery', 'bronze', {kind: 'habitStreak', n: 7}),
  def('habit_streak_30', 'mastery', 'gold', {kind: 'habitStreak', n: 30}),
  def('habit_streak_66', 'mastery', 'ruby', {kind: 'habitStreak', n: 66}),
  def('habits_5', 'variety', 'bronze', {kind: 'activeHabits', n: 5}),
  def('areas_3', 'variety', 'silver', {kind: 'areas', n: 3}),
  def('areas_6', 'variety', 'gold', {kind: 'areas', n: 6}),
  def('days_7', 'time', 'bronze', {kind: 'daysSince', n: 7}),
  def('days_30', 'time', 'silver', {kind: 'daysSince', n: 30}),
  def('days_100', 'time', 'gold', {kind: 'daysSince', n: 100}),
  def('days_365', 'time', 'blaze', {kind: 'daysSince', n: 365}),
] as const;

export type AwardId = (typeof AWARDS)[number]['id'];
export type AwardDef = (typeof AWARDS)[number];

// The six streak medals of 1.0: celebrated by the overlay under `streak:N`, never by an award toast
export const MEDAL_AWARD_IDS: readonly AwardId[] = ['streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_60', 'streak_100'];

// Steady week and month: at least 80% of the scheduled habit-days ticked (integer form: done * 5 >= scheduled * 4)
export const STEADY_SHARE = 0.8;
// Never twice: a 30-date window with at least 20 dates that have something scheduled
export const NEVER_TWICE_DAYS = 30;
export const NEVER_TWICE_MIN_SCHEDULED_DAYS = 20;
// Back again: a tick at least this many days after the previous date with a tick (3 or more empty dates between)
export const COMEBACK_GAP_DAYS = 4;

// Everything the rules read, computed once per stats load
export type AwardMetrics = {
  longestStreak: number;
  perfectDays: number;
  bestPerfectRun: number;
  ticks: number;
  steady: Record<number, boolean>;// window length -> some window qualifies
  neverTwice: boolean;
  weekendDone: boolean;
  comeback: boolean;
  bestHabitStreak: number;
  activeHabits: number;
  areas: number;
  daysSince: number | null;// null: no tick yet
};

export type AwardState = {id: AwardId; earned: boolean; remaining: number | null};// remaining: how far to go, when it is a count

// What the XP code already computed in the same stats load (utils/gamification.ts computeGamification), so the awards
// don't walk the history for them again. Without it the awards compute both themselves (same numbers, slower).
export type KnownStats = {longestStreak: number; perfectDays: number};

// One pass builds a table of every date from the first created date to today (its date string, weekday, habits
// scheduled and ticked); every rule then reads the table. tests/awards-speed.test.ts checks the results against the
// first implementation (tests/helpers/awards-reference.ts) on many random fixtures.
export function awardMetrics(habitsIn: readonly RadarHabit[], completions: readonly GamiCompletion[], today: string,
  known?: KnownStats): AwardMetrics {
  requireToday(today);
  const habits = clampCreatedDates([...habitsIn], today);// S-2
  const active = habits.filter((h) => !h.deleted);
  const done = completions.filter((c) => c.completed === true && isDateString(c.date) && c.date <= today);
  const doneKeys = new Set(done.map((c) => `${c.habitId}|${c.date}`));
  const todayN = toDayNumber(today);

  // the walk starts at the earliest created date of any habit (deleted included); days before it hold nothing
  const created = habits.map((h) => h.createdDate).filter(isDateString).sort();
  const firstCreated = created.length > 0 ? toDayNumber(created[0]) : null;

  // the day table: per date from the first created date to today, its string and weekday (computed once), and the
  // habits scheduled and ticked
  const days: {n: number; date: string; weekday: WeekdayKey; scheduled: number; ticked: number}[] = [];
  if (firstCreated !== null) {
    for (let n = firstCreated; n <= todayN; n++) {
      const date = fromDayNumber(n);
      const weekday = weekdayOf(n);
      let scheduled = 0;
      let ticked = 0;
      for (const h of active) {
        if (h.createdDate > date || (h.frequencyType !== 'daily' && !h.days.includes(weekday))) continue;
        scheduled += 1;
        if (doneKeys.has(h.habitId + '|' + date)) ticked += 1;
      }
      days.push({n, date, weekday, scheduled, ticked});
    }
  }
  const isPerfect = (d: {scheduled: number; ticked: number}) => d.scheduled > 0 && d.ticked === d.scheduled;
  const isMissed = (d: {n: number; scheduled: number; ticked: number}) => d.n < todayN && d.scheduled > 0 && d.ticked === 0;

  // perfect runs: empty dates are skipped; a past date with something scheduled and not perfect breaks; today only adds
  let run = 0;
  let bestPerfectRun = 0;
  for (const d of days) {
    if (d.scheduled === 0) continue;
    if (isPerfect(d)) bestPerfectRun = Math.max(bestPerfectRun, ++run);
    else if (d.n < todayN) run = 0;
  }

  // steady windows (7 and 30 dates): sums over each window that lies inside the walk
  const steady: Record<number, boolean> = {};
  for (const award of AWARDS) {
    if (award.rule.kind !== 'steady') continue;
    const {days: size, minScheduled} = award.rule;
    let found = false;
    for (let end = size - 1; end < days.length && !found; end++) {
      let scheduled = 0;
      let ticked = 0;
      for (let i = end - size + 1; i <= end; i++) {
        scheduled += days[i].scheduled;
        ticked += days[i].ticked;
      }
      found = scheduled >= minScheduled && ticked * 5 >= scheduled * 4;
    }
    steady[size] = found;
  }

  // never twice: a 30-date window inside the walk, 20+ dates with something scheduled, no two missed dates in a row
  let neverTwice = false;
  for (let end = NEVER_TWICE_DAYS - 1; end < days.length && !neverTwice; end++) {
    const window = days.slice(end - NEVER_TWICE_DAYS + 1, end + 1);
    const withSomething = window.filter((d) => d.scheduled > 0).length;
    const twice = window.some((d, i) => i > 0 && isMissed(d) && isMissed(window[i - 1]));
    neverTwice = withSomething >= NEVER_TWICE_MIN_SCHEDULED_DAYS && !twice;
  }

  // weekend done: a Saturday and the Sunday after it, both perfect
  let weekendDone = false;
  for (let i = 0; i + 1 < days.length && !weekendDone; i++) {
    weekendDone = days[i].weekday === 'sat' && isPerfect(days[i]) && isPerfect(days[i + 1]);
  }

  // back again: two dates with a tick (any habit, deleted included) at least COMEBACK_GAP_DAYS apart, nothing between
  const tickDays = [...new Set(done.map((c) => toDayNumber(c.date)))].sort((a, b) => a - b);
  const comeback = tickDays.some((n, i) => i > 0 && n - tickDays[i - 1] >= COMEBACK_GAP_DAYS);

  // habit mastery: each active habit's longest run on its own scheduled dates
  let bestHabitStreak = 0;
  for (const h of active) {
    let streak = 0;
    for (let i = toDayNumber(h.createdDate) - (firstCreated ?? 0); i < days.length; i++) {
      const d = days[i];
      if (h.frequencyType !== 'daily' && !h.days.includes(d.weekday)) continue;
      if (doneKeys.has(h.habitId + '|' + d.date)) bestHabitStreak = Math.max(bestHabitStreak, ++streak);
      else if (d.n < todayN) streak = 0;
    }
  }

  // areas: through the icon-to-area table only (a General or unknown icon counts toward none)
  const areas = new Set(active.map((h) => iconArea(h.icon)).filter((a) => a !== 'none')).size;

  return {
    longestStreak: known?.longestStreak ?? computeStreaks(habits, [...completions], today).longestStreak,
    perfectDays: known?.perfectDays ?? countPerfectDays(habits, [...completions], today),
    bestPerfectRun,
    ticks: done.length,
    steady,
    neverTwice,
    weekendDone,
    comeback,
    bestHabitStreak,
    activeHabits: active.length,
    areas,
    daysSince: done.length > 0 && firstCreated !== null ? todayN - firstCreated : null,
  };
}

// One award against the metrics: earned, and for a count how many are still to go
export function evaluateAward(award: AwardDef, m: AwardMetrics): AwardState {
  const count = (value: number, n: number): AwardState => ({id: award.id, earned: value >= n, remaining: Math.max(0, n - value)});
  const flag = (earned: boolean): AwardState => ({id: award.id, earned, remaining: null});
  const rule: AwardRule = award.rule;
  switch (rule.kind) {
    case 'longestStreak': return count(m.longestStreak, rule.n);
    case 'perfectDays': return count(m.perfectDays, rule.n);
    case 'perfectRun': return count(m.bestPerfectRun, rule.n);
    case 'ticks': return count(m.ticks, rule.n);
    case 'steady': return flag(m.steady[rule.days] === true);
    case 'neverTwice': return flag(m.neverTwice);
    case 'weekend': return flag(m.weekendDone);
    case 'comeback': return flag(m.comeback);
    case 'habitStreak': return count(m.bestHabitStreak, rule.n);
    case 'activeHabits': return count(m.activeHabits, rule.n);
    case 'areas': return count(m.areas, rule.n);
    case 'daysSince': return m.daysSince === null ? flag(false) : count(m.daysSince, rule.n);
  }
}

// Every award, in table order
export function computeAwards(habits: readonly RadarHabit[], completions: readonly GamiCompletion[], today: string,
  known?: KnownStats): AwardState[] {
  const m = awardMetrics(habits, completions, today, known);
  return AWARDS.map((award) => evaluateAward(award, m));
}

export const earnedAwardIds = (states: readonly AwardState[]): AwardId[] => states.filter((s) => s.earned).map((s) => s.id);

// ---------- Celebrations (pure; wired into Home's queue in C4 Set 3) ----------

export const awardKey = (id: AwardId) => `award:${id}`;

const TIER_RANK: Record<MedalTier, number> = {bronze: 0, silver: 1, gold: 2, emerald: 3, ruby: 4, blaze: 5};

// After a tick: the one new award to toast (the highest tier, the later in the table on a tie), and the keys to mark
// now, every newly earned award, so none of them comes up again on this phone. Streak medals are left to the overlay;
// an award already celebrated here is left out. Earned before the tick (or with no tick at all): nothing.
export function awardToToast(before: readonly AwardId[], after: readonly AwardId[], celebrated: ReadonlySet<string>): {
  show: AwardId | null;
  keys: string[];
} {
  const had = new Set(before);
  const fresh = AWARDS.filter((a) => after.includes(a.id) && !had.has(a.id) && !MEDAL_AWARD_IDS.includes(a.id)
    && !celebrated.has(awardKey(a.id)));
  let show: AwardDef | null = null;
  for (const a of fresh) if (!show || TIER_RANK[a.tier] >= TIER_RANK[show.tier]) show = a;
  return {show: show?.id ?? null, keys: fresh.map((a) => awardKey(a.id))};
}

// The award toast for one tick: nothing when the awards before the tick are unknown (an entry from before the awards
// existed, the first stats of an install) or the celebrated keys can't be read, so an award a user already holds is
// never celebrated (silent backfill); otherwise awardToToast.
export function awardFromTick(before: readonly AwardState[] | undefined, after: readonly AwardState[] | undefined,
  celebrated: ReadonlySet<string> | null): {show: AwardId | null; keys: string[]} {
  if (!before || !after || celebrated === null) return {show: null, keys: []};
  return awardToToast(earnedAwardIds(before), earnedAwardIds(after), celebrated);
}

// ---------- What the Awards section and screen show (C4 Set 3) ----------

export type AwardView = AwardDef & {state: AwardState};

export function awardViews(states: readonly AwardState[]): AwardView[] {
  return AWARDS.map((def) => ({...def, state: states.find((s) => s.id === def.id) ?? {id: def.id, earned: false, remaining: null}}));
}

// The next ones to earn: locked count awards nearest to done (the largest share already done), then the others in
// table order. A share is done / target, so 2 of 3 comes before 5 of 10.
export function nextToEarn(states: readonly AwardState[], count = 3): AwardView[] {
  const locked = awardViews(states).filter((v) => !v.state.earned);
  const share = (v: AwardView) => {
    const n = (v.rule as {n?: number}).n;
    return v.state.remaining !== null && typeof n === 'number' && n > 0 ? (n - v.state.remaining) / n : -1;
  };
  return locked
    .map((v, i) => ({v, i, s: share(v)}))
    .sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i))
    .slice(0, count)
    .map(({v}) => v);
}

// Every award by group, in the groups' order
export function awardsByGroup(states: readonly AwardState[]): {group: AwardGroup; awards: AwardView[]}[] {
  const views = awardViews(states);
  return AWARD_GROUPS.map((group) => ({group, awards: views.filter((v) => v.group === group)}));
}
