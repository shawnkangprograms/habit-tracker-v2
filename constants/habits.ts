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

// An icon id this build doesn't know (written by a newer build) is stored and pushed as it came, so an older build
// never erases it, and drawn with a default glyph. The shape is the one the rules allow (a string of 1 to 32
// characters), restricted to printable ASCII without spaces.
export const STORED_ICON_RE = /^[\x21-\x7E]{1,32}$/;

export function isKnownIcon(value: unknown): value is IconId {
  return typeof value === 'string' && (ICON_IDS as readonly string[]).includes(value);
}

// How many minutes before the due time the reminder fires (0 = at the time). Same set as the SQLite CHECK.
export const REMIND_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export type RemindBeforeMin = (typeof REMIND_BEFORE_OPTIONS)[number];

export type Frequency =
  | { type: 'daily' }
  | { type: 'weekdays'; days: WeekdayKey[] };
