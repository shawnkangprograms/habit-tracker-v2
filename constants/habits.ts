// Shared habit constants and types. No imports, so validators and helpers stay pure.

// Weekday keys in getDay() order: index 0 is Sunday.
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

// PLACEHOLDER icon list (to be confirmed). Stable string ids, not emoji.
export const ICON_IDS = [
  'book', 'water', 'run', 'meditate', 'sleep', 'food',
  'study', 'work', 'music', 'money', 'heart', 'star',
] as const;
export type IconId = (typeof ICON_IDS)[number];

// How many minutes before the due time the reminder fires (0 = at the time). Same set as the SQLite CHECK.
export const REMIND_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export type RemindBeforeMin = (typeof REMIND_BEFORE_OPTIONS)[number];

export type Frequency =
  | { type: 'daily' }
  | { type: 'weekdays'; days: WeekdayKey[] };
