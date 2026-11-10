// Per-day completion counts (docs/PACKS_REPORTS_SPEC.md, sections 11 and 13): for each local day, how many habits
// were scheduled and how many of those were done. Shared by Vitality (Stage 4) and, later, the live radar. Pure.
//
// The perfect-day rule of utils/gamification.ts, through its own helpers, so the two can never disagree:
// - scheduled: habits not deleted, created on or before that date (the creation day counts), daily or due on that
//   weekday under their CURRENT schedule (the known limitation: a frequency change also changes past days)
// - done: those scheduled habits with a completed row for that date
// Deleted habits drop out of every day, past ones included, and their completions are not counted. Completion rows
// dated after today are ignored. Days are stepped by calendar day numbers, never by the clock, so daylight saving
// and time zone changes can't add or skip a day.

import {
  clampCreatedDates, fromDayNumber, isDateString, isScheduledOn, requireToday, toDayNumber, type GamiCompletion, type GamiHabit,
} from '@/utils/gamification';

export type DayCount = {date: string; scheduled: number; done: number};

// closed: every day from the first day with at least one scheduled habit up to yesterday (rest days included,
// with scheduled 0), oldest first. today: today's count so far (null if nothing is scheduled today).
export function dailyCompletion(
  habits: GamiHabit[],
  completions: GamiCompletion[],
  today: string,
): {closed: DayCount[]; today: DayCount | null} {
  requireToday(today);
  // S-2: a createdDate after today (clock ahead) counts from today; no past day is invented for it
  const active = clampCreatedDates(habits, today).filter((h) => !h.deleted && isDateString(h.createdDate));
  const doneKeys = new Set(completions
    .filter((c) => c.completed === true && isDateString(c.date) && c.date <= today)
    .map((c) => `${c.habitId}|${c.date}`));

  const count = (date: string): DayCount => {
    const scheduled = active.filter((h) => isScheduledOn(h, date));
    return {date, scheduled: scheduled.length, done: scheduled.filter((h) => doneKeys.has(`${h.habitId}|${date}`)).length};
  };

  const todayN = toDayNumber(today);
  const closed: DayCount[] = [];
  if (active.length > 0) {
    let started = false;
    const first = Math.min(...active.map((h) => toDayNumber(h.createdDate)));
    for (let n = first; n < todayN; n++) {
      const day = count(fromDayNumber(n));
      if (!started && day.scheduled === 0) continue;// history starts on the first day with a scheduled habit
      started = true;
      closed.push(day);
    }
  }
  const now = count(today);
  return {closed, today: now.scheduled > 0 ? now : null};
}
