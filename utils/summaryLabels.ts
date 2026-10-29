// Words and buckets for the Summary tab: rate text, screen-reader labels and the colour step of a day.
// Pure functions: no React, no theme. Runs under Node's test runner, so only `import type` from '@/...'.

import type {WeekdayKey} from '@/constants/habits';
import type {HabitRate, SummaryDay, SummaryRange} from '@/utils/summary';

const WEEKDAY_NAMES: Record<WeekdayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export const NO_RATE = '–'; // shown instead of 0%, NaN or a divide by zero when nothing has counted yet

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "80%", or NO_RATE. Rounded to the nearest percent, but 100% only when everything was done:
// anything below 1 that would round to 100 shows 99%.
export function rateText(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return NO_RATE;
  if (rate >= 1) return '100%';
  return `${Math.min(99, Math.round(rate * 100))}%`;
}

export function rangeWords(range: SummaryRange): string {
  return range === 'week' ? 'in the last 7 days' : 'in the last 30 days';
}

// Colour step of a day: 'none' (nothing scheduled), 0 (scheduled, none done), 1..3 (some), 4 (all done)
export type ShareStep = 'none' | 0 | 1 | 2 | 3 | 4;

export function shareStep(day: Pick<SummaryDay, 'scheduled' | 'done'>): ShareStep {
  if (day.scheduled === 0) return 'none';
  if (day.done === 0) return 0;
  if (day.done >= day.scheduled) return 4;
  // exact thirds, no floats: done/scheduled < 1/3 -> 1, < 2/3 -> 2, else 3
  if (3 * day.done < day.scheduled) return 1;
  if (3 * day.done < 2 * day.scheduled) return 2;
  return 3;
}

// Short caption under a bar: "Today" or "Mon"
export function barCaption(day: SummaryDay): string {
  return day.isToday ? 'Today' : WEEKDAY_NAMES[day.weekday].slice(0, 3);
}

// Value under a bar: "3/4", or NO_RATE when nothing was scheduled
export function barValue(day: SummaryDay): string {
  return day.scheduled === 0 ? NO_RATE : `${day.done}/${day.scheduled}`;
}

function dateWords(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

// "Monday: 3 of 4 habits done", "Today, so far: 0 of 1 habit done", "Saturday, October 24: no habits scheduled"
export function dayLabel(day: SummaryDay, withDate = false): string {
  const name = day.isToday
    ? 'Today, so far'
    : withDate ? `${WEEKDAY_NAMES[day.weekday]}, ${dateWords(day.date)}` : WEEKDAY_NAMES[day.weekday];
  if (day.scheduled === 0) return `${name}: no habits scheduled`;
  const perfect = day.perfect && !day.isToday ? ', a perfect day' : '';
  return `${name}: ${day.done} of ${plural(day.scheduled, 'habit')} done${perfect}`;
}

// "Read: 4 of 5 days done, 80%. Best this range" / "Read: not scheduled yet"
export function habitLabel(h: HabitRate): string {
  if (h.scheduled === 0) return `${h.habitName}: not scheduled yet`;
  return `${h.habitName}: ${h.done} of ${plural(h.scheduled, 'day')} done, ${rateText(h.rate)}${h.best ? '. Best this range' : ''}`;
}

export function habitDetail(h: HabitRate): string {
  return h.scheduled === 0 ? 'Not scheduled yet' : `${h.done} of ${plural(h.scheduled, 'day')}`;
}

export function daysText(n: number): string {
  return plural(n, 'day');
}
