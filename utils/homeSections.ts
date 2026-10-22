// Home's two sections: "Today" (habits due today, exactly as loaded) and "Other days" (active habits not due
// today, not completable). Pure: no React or database imports. Weekdays come from the LOCAL date only.

import {WEEKDAY_KEYS, type WeekdayKey} from '@/constants/habits';

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];// display order, Monday first
const SHORT_NAMES: Record<WeekdayKey, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const FULL_NAMES: Record<WeekdayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

// One row from getActiveHabitsWithDays: every active habit, days sorted Mon..Sun (empty for daily habits)
export type ActiveHabit = {
  habitId: string;
  habitName: string;
  icon: string;
  frequencyType: 'daily' | 'weekdays';
  reminderTime: string | null;
  createdAt: number;
  days: WeekdayKey[];
};

export type OtherDayHabit = ActiveHabit & {next: WeekdayKey; inDays: number};

export function shortDayName(day: WeekdayKey): string {
  return SHORT_NAMES[day];
}

export function fullDayName(day: WeekdayKey): string {
  return FULL_NAMES[day];
}

// The weekday of a local YYYY-MM-DD (local constructor, never the UTC date)
export function weekdayOfDate(localDate: string): WeekdayKey {
  const [year, month, day] = localDate.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(year, month - 1, day).getDay()];
}

// "Every day", "Every Mon, Wed", or "Specific days" if the days are missing (the days read failed)
export function scheduleSummary(frequencyType: 'daily' | 'weekdays', days: readonly WeekdayKey[] | undefined): string {
  if (frequencyType === 'daily') return 'Every day';
  if (!days || days.length === 0) return 'Specific days';
  return `Every ${DAY_ORDER.filter((d) => days.includes(d)).map(shortDayName).join(', ')}`;
}

// The next scheduled weekday AFTER today (1..7 days away; 7 = only today's weekday), or null with no days
export function nextDueDay(days: readonly WeekdayKey[], today: WeekdayKey): {day: WeekdayKey; inDays: number} | null {
  const start = WEEKDAY_KEYS.indexOf(today);
  for (let inDays = 1; inDays <= 7; inDays++) {
    const day = WEEKDAY_KEYS[(start + inDays) % 7];
    if (days.includes(day)) return {day, inDays};
  }
  return null;
}

// Today's rows are returned unchanged (same order). "Other days" is every active weekday habit that is
// neither in today's rows nor scheduled today, by next due day, then name. A habit due today is never
// in "Other days", even if its row is missing from today's list. No active-habits read: no "Other days".
export function splitHomeRows<T extends {habitId: string}>(
  todayRows: T[],
  allHabits: ActiveHabit[] | null,
  today: WeekdayKey,
): {today: T[]; other: OtherDayHabit[]} {
  if (!allHabits) return {today: todayRows, other: []};
  const todayIds = new Set(todayRows.map((r) => r.habitId));
  const other: OtherDayHabit[] = [];
  for (const habit of allHabits) {
    if (todayIds.has(habit.habitId) || habit.frequencyType !== 'weekdays' || habit.days.includes(today)) continue;
    const next = nextDueDay(habit.days, today);
    if (next) other.push({...habit, next: next.day, inDays: next.inDays});
  }
  other.sort((a, b) => a.inDays - b.inDays
    || a.habitName.localeCompare(b.habitName, undefined, {sensitivity: 'base'})
    || a.habitId.localeCompare(b.habitId));
  return {today: todayRows, other};
}
