/// <reference types="node" />
// TEST-ONLY reference: the award metrics exactly as C4 Set 1 shipped them (one date string and weekday per habit per
// day, and its own longest-streak and perfect-day walks). utils/awards.ts now computes the same numbers faster (one
// shared day table, and the longest streak and perfect-day count the XP code already has); tests/awards-speed.test.ts
// checks the two agree on many random fixtures. Never imported by the app.
import {
  clampCreatedDates, computeStreaks, countPerfectDays, fromDayNumber, isDateString, requireToday, toDayNumber, weekdayOf,
  type GamiCompletion,
} from '../../utils/gamification.ts';
import {
  AWARDS, COMEBACK_GAP_DAYS, NEVER_TWICE_DAYS, NEVER_TWICE_MIN_SCHEDULED_DAYS, evaluateAward, type AwardMetrics, type AwardState,
} from '../../utils/awards.ts';
import {iconArea} from '../../utils/radar/areas.ts';
import type {RadarHabit} from '../../utils/radar/score.ts';

export function referenceAwards(habits: readonly RadarHabit[], completions: readonly GamiCompletion[], today: string): AwardState[] {
  const m = referenceAwardMetrics(habits, completions, today);
  return AWARDS.map((award) => evaluateAward(award, m));
}

export function referenceAwardMetrics(habitsIn: readonly RadarHabit[], completions: readonly GamiCompletion[], today: string): AwardMetrics {
  requireToday(today);
  const habits = clampCreatedDates([...habitsIn], today);// S-2
  const active = habits.filter((h) => !h.deleted);
  const done = completions.filter((c) => c.completed === true && isDateString(c.date) && c.date <= today);
  const doneKeys = new Set(done.map((c) => `${c.habitId}|${c.date}`));
  const todayN = toDayNumber(today);

  // the walk starts at the earliest created date of any habit (deleted included); days before it hold nothing
  const created = habits.map((h) => h.createdDate).filter(isDateString).sort();
  const firstCreated = created.length > 0 ? toDayNumber(created[0]) : null;

  // per date from the first created date to today: habits scheduled, of those ticked
  const scheduledOn = (n: number) => {
    const date = fromDayNumber(n);
    const weekday = weekdayOf(n);
    return active.filter((h) => h.createdDate <= date && (h.frequencyType === 'daily' || h.days.includes(weekday)));
  };
  const days: {n: number; scheduled: number; ticked: number}[] = [];
  if (firstCreated !== null) {
    for (let n = firstCreated; n <= todayN; n++) {
      const date = fromDayNumber(n);
      const scheduled = scheduledOn(n);
      days.push({n, scheduled: scheduled.length, ticked: scheduled.filter((h) => doneKeys.has(`${h.habitId}|${date}`)).length});
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
    weekendDone = weekdayOf(days[i].n) === 'sat' && isPerfect(days[i]) && isPerfect(days[i + 1]);
  }

  // back again: two dates with a tick (any habit, deleted included) at least COMEBACK_GAP_DAYS apart, nothing between
  const tickDays = [...new Set(done.map((c) => toDayNumber(c.date)))].sort((a, b) => a - b);
  const comeback = tickDays.some((n, i) => i > 0 && n - tickDays[i - 1] >= COMEBACK_GAP_DAYS);

  // habit mastery: each active habit's longest run on its own scheduled dates
  let bestHabitStreak = 0;
  for (const h of active) {
    let streak = 0;
    for (let n = toDayNumber(h.createdDate); n <= todayN; n++) {
      const weekday = weekdayOf(n);
      if (h.frequencyType !== 'daily' && !h.days.includes(weekday)) continue;
      if (doneKeys.has(`${h.habitId}|${fromDayNumber(n)}`)) bestHabitStreak = Math.max(bestHabitStreak, ++streak);
      else if (n < todayN) streak = 0;
    }
  }

  // areas: through the icon-to-area table only (a General or unknown icon counts toward none)
  const areas = new Set(active.map((h) => iconArea(h.icon)).filter((a) => a !== 'none')).size;

  return {
    longestStreak: computeStreaks(habits, [...completions], today).longestStreak,
    perfectDays: countPerfectDays(habits, [...completions], today),
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
