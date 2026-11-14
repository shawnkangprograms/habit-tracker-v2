// Shared habit constants and types. The only import is the icon set, which is pure data, so validators and helpers
// stay pure.
import {ALL_ICON_IDS, LEGACY_ICON_IDS, type IconId} from '@/constants/habitIconSet';

export type {IconId};

// Weekday keys in getDay() order: index 0 is Sunday.
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

// The release switch for the C3 icons (docs/HABITQUEST_DESIGN.md, C3). Every build draws the whole set
// (constants/habitIconSet.ts), but only ICON_IDS can be picked, validated as a new choice and sent to the insight
// function. Turn it on only after (1) every tester runs a bundle with the Stage A tolerance (an older 1.0 build skips a
// habit whose icon it doesn't know) and (2) the insight function with the full ICON_LABELS is deployed (it refuses the
// whole request for an icon it doesn't know). tests/icon-set.test.ts pins it to false: a release commit changes both.
export const RELEASE_NEW_ICONS = false;

// The icon ids that can be chosen: the twelve of 1.0 until the switch is on, then the whole set
export const ICON_IDS: readonly IconId[] = RELEASE_NEW_ICONS ? ALL_ICON_IDS : LEGACY_ICON_IDS;

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
