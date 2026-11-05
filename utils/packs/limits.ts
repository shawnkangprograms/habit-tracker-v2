// Limits by level (docs/PACKS_REPORTS_SPEC.md, section 2b). Pure. The numbers live in limitsForLevel only, so
// they can be tuned without touching anything else. The level comes from the local gamification stats
// (db/gamification.js, derived from completions in SQLite, no network); it is never read at cold start.
//
// Nothing is ever removed: a user above a limit keeps everything and simply has no room. Onboarding's own habit
// creation never asks for room.

import {habitLimitMessage, packLimitMessage} from '@/utils/packs/copy';

export type LimitKind = 'habits' | 'packs';

// The highest level the next-level lookup searches; far above any real level
const SEARCH_MAX = 1000;

const asLevel = (level: number) => (Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1);

export function limitsForLevel(level: number): Record<LimitKind, number> {
  const l = asLevel(level);
  return {habits: 12 + 2 * (l - 1), packs: 2 + Math.floor((l - 1) / 2)};
}

// The {x} in the limit message: the lowest level whose limit is higher than both this level's limit and the
// count the account already has. An account above its limit (levels can fall, habits can arrive from another
// device) is told the level it actually needs, not just the next one. count 0 (the default): the next level whose
// limit is higher than this level's.
export function nextLimitLevel(level: number, kind: LimitKind, count = 0): number {
  const l = asLevel(level);
  const needed = Math.max(limitsForLevel(l)[kind], Number.isFinite(count) ? count : 0);
  for (let next = l + 1; next <= SEARCH_MAX; next++) {
    if (limitsForLevel(next)[kind] > needed) return next;
  }
  return SEARCH_MAX;
}

// The limit message for an account at this level with this many habits or packs: built in one place for every
// add path (checkAdd, Home's "Add the rest", the pack picker)
export function limitMessageFor(kind: LimitKind, level: number, count: number): string {
  const next = nextLimitLevel(level, kind, count);
  return kind === 'habits' ? habitLimitMessage(next) : packLimitMessage(next);
}

// How many more can be added now (0 at or above the limit)
export function roomFor(level: number, kind: LimitKind, count: number): number {
  return Math.max(0, limitsForLevel(level)[kind] - Math.max(0, count));
}

// ---------- The one check every add path uses (Stage 2) ----------
// "Add a habit", the habit form when adding, "Create a habit pack", the picker, "Add the rest" and a Settings
// retake of onboarding. Only adding is ever refused: an account above a limit keeps, ticks, edits, moves and
// deletes everything (section 16). adding: how many the caller wants to add now (default 1).

export type AddCheck = {ok: true; room: number} | {ok: false; room: number; message: string};// room: how many fit now

export function checkAdd(input: {level: number; kind: LimitKind; count: number; adding?: number}): AddCheck {
  const room = roomFor(input.level, input.kind, input.count);
  if (room >= Math.max(1, input.adding ?? 1)) return {ok: true, room};
  return {ok: false, room, message: limitMessageFor(input.kind, input.level, input.count)};
}
