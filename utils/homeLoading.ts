// What Home shows while its data is still unknown at launch (the cold-start flash fix). Pure.
//
// Rule: nothing on screen may say something untrue, and nothing above the fold may jump. Before the first habit
// load ("habits known" = Home's `loaded`) a pack card has a name, a blank status line and an empty bar, and an
// expanded one has one plain placeholder block per habit id in its saved record; the add controls ("Create a
// habit pack", "Habits", "Add a habit") wait. Before the first stats load has finished the stats card's exact
// space is held by an empty card. Once data is known everything is exactly as it was before this fix.

import {packProgress} from '@/utils/packs/copy';

// A non-breaking space: the status Text keeps its line height but shows no words
export const BLANK_STATUS = ' ';

export function packStatusText(input: {known: boolean; done: number; total: number; hasHabits: boolean}): string {
  return input.known ? packProgress(input.done, input.total, input.hasHabits) : BLANK_STATUS;
}

export type StatsSlot = 'placeholder' | 'card' | 'none';

// statsSettled: the first stats load has finished (either way). One rule for every stats failure (F-1, decided
// 2026-11-13): with nothing shown yet, the card's space stays held by the placeholder (it used to collapse); once
// numbers were shown, the card keeps them (statsAfterLoad). So a failure never shows a lower level, or none at all
// after one was shown. 'none' is no longer produced.
export function statsSlot(input: {statsSettled: boolean; hasStats: boolean}): StatsSlot {
  return input.hasStats ? 'card' : 'placeholder';
}

// What the card shows after a load: the new stats, or after a failed load (null) the last ones shown for this
// user. Another user's numbers are never kept.
export function statsAfterLoad<T extends {userId: string}>(shown: T | null, loaded: T | null, userId: string): T | null {
  if (loaded) return loaded;
  return shown?.userId === userId ? shown : null;
}

export function showAddControls(input: {loaded: boolean}): boolean {
  return input.loaded;
}

// Placeholder rows for a pack card before habits are known: one per saved habit id (no cap), none when collapsed
// or once habits are known
export function placeholderRows(input: {known: boolean; expanded: boolean; habitIds: readonly string[]}): number {
  return input.known || !input.expanded ? 0 : input.habitIds.length;
}
