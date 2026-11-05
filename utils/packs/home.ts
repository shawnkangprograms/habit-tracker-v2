// Home's pack sections (docs/PACKS_REPORTS_SPEC.md, sections 3 and 4, Stage 1b). Pure.
//
// Today's rows split into the user's packs (record order) and "Habits" (unpacked). A packed habit appears only
// inside its pack. With no packs (no record, an empty one, a corrupt one, or one not read yet) everything is
// unpacked and Home looks as it did before packs. "Other days" is not touched here.

import {missingTemplates, type HabitRef} from '@/utils/packs/membership';
import type {ParsedPacks} from '@/utils/packs/record';
import type {TemplateId} from '@/utils/onboarding/types';

export type TodayRow = {habitId: string; completed: number};

export type PackSection<T extends TodayRow> = {
  packId: string;
  name: string;
  rows: T[];// the pack's habits due today, in Home's order
  done: number;
  missing: TemplateId[] | null;// templates "Add the rest" would bring in; null when the active habits are unknown
  hasHabits: boolean;// false: no active habit at all ("No habits yet"); true when the active habits are unknown
};

export type HomeGroups<T extends TodayRow> = {packs: PackSection<T>[]; unpacked: T[]};

// The record Home groups by, or null when the user has no packs to show
function shownRecord(parsed: ParsedPacks | null) {
  return parsed?.kind === 'ok' && parsed.record.packs.length > 0 ? parsed.record : null;
}

// all: every active habit (null if that read failed: no "Add the rest" then, since its numbers would be wrong)
export function homeGroups<T extends TodayRow>(
  parsed: ParsedPacks | null, today: readonly T[], all: readonly HabitRef[] | null,
): HomeGroups<T> {
  const record = shownRecord(parsed);
  if (!record) return {packs: [], unpacked: [...today]};
  const active = all ? new Set(all.map((h) => h.habitId)) : null;
  const owner = new Map<string, string>();
  for (const pack of record.packs) for (const id of pack.habitIds) owner.set(id, pack.id);
  return {
    packs: [...record.packs].sort((a, b) => a.order - b.order).map((pack) => {
      const rows = today.filter((row) => owner.get(row.habitId) === pack.id);
      return {
        packId: pack.id,
        name: pack.name,
        rows,
        done: rows.filter((row) => row.completed === 1).length,
        missing: all ? missingTemplates(record, pack.id, all) : null,
        hasHabits: active ? pack.habitIds.some((id) => active.has(id)) : true,
      };
    }),
    unpacked: today.filter((row) => !owner.has(row.habitId)),
  };
}

// "Choose your habit packs": for users with at least one active habit and no packs (no record, an empty one, or
// a corrupt one, which the picker may write over since that is the user changing something), unless they
// tapped "Not now". Unknown (not read yet) shows nothing.
export function showChooseCard(state: {parsed: ParsedPacks; dismissed: boolean} | null, activeCount: number | null): boolean {
  if (!state || state.dismissed || activeCount === null || activeCount < 1) return false;
  return shownRecord(state.parsed) === null;
}
