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

// statsSettled: the first stats load has finished (either way). After a failure the slot is empty, as before.
export function statsSlot(input: {statsSettled: boolean; hasStats: boolean}): StatsSlot {
  if (input.hasStats) return 'card';
  return input.statsSettled ? 'none' : 'placeholder';
}

export function showAddControls(input: {loaded: boolean}): boolean {
  return input.loaded;
}

// Placeholder rows for a pack card before habits are known: one per saved habit id (no cap), none when collapsed
// or once habits are known
export function placeholderRows(input: {known: boolean; expanded: boolean; habitIds: readonly string[]}): number {
  return input.known || !input.expanded ? 0 : input.habitIds.length;
}
