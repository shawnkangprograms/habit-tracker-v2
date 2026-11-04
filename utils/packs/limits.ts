// Limits by level (docs/PACKS_REPORTS_SPEC.md, section 2b). Pure. The numbers live in limitsForLevel only, so
// they can be tuned without touching anything else. The level comes from the local gamification stats
// (db/gamification.js, derived from completions in SQLite, no network); it is never read at cold start.
//
// Nothing is ever removed: a user above a limit keeps everything and simply has no room. Onboarding's own habit
// creation never asks for room.

export type LimitKind = 'habits' | 'packs';

// The highest level the next-level lookup searches; far above any real level
const SEARCH_MAX = 1000;

const asLevel = (level: number) => (Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1);

export function limitsForLevel(level: number): Record<LimitKind, number> {
  const l = asLevel(level);
  return {habits: 12 + 2 * (l - 1), packs: 2 + Math.floor((l - 1) / 2)};
}

// The lowest level whose limit is higher than this level's: the {x} in the limit message
export function nextLimitLevel(level: number, kind: LimitKind): number {
  const l = asLevel(level);
  const current = limitsForLevel(l)[kind];
  for (let next = l + 1; next <= SEARCH_MAX; next++) {
    if (limitsForLevel(next)[kind] > current) return next;
  }
  return SEARCH_MAX;
}

// How many more can be added now (0 at or above the limit)
export function roomFor(level: number, kind: LimitKind, count: number): number {
  return Math.max(0, limitsForLevel(level)[kind] - Math.max(0, count));
}
