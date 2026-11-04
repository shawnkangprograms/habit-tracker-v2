// Pack membership (docs/PACKS_REPORTS_SPEC.md, sections 2 and 3). Pure; records are never changed in place.
//
// Names are compared after trimming, collapsing inner spaces and ignoring case, so "  walk for 20  minutes" is
// the template "Walk for 20 minutes". A template counts as present in a pack when an active habit in that pack
// has its name; "missing" templates are the rest, minus the ones the user dropped.

import {builtinPack} from '@/utils/packs/builtin';
import type {Pack, PacksRecord} from '@/utils/packs/record';
import {TEMPLATE_NAMES} from '@/utils/onboarding/copy';
import type {TemplateId} from '@/utils/onboarding/types';

export type HabitRef = {habitId: string; habitName: string};// an active (not deleted) habit

export function normaliseHabitName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const templateKey = (id: TemplateId) => normaliseHabitName(TEMPLATE_NAMES[id]);

function replacePack(record: PacksRecord, next: Pack): PacksRecord {
  return {...record, packs: record.packs.map((p) => (p.id === next.id ? next : p))};
}

// Membership without the habits deleted since (active: ids of the active habits)
export function withoutDeleted(record: PacksRecord, active: ReadonlySet<string>): PacksRecord {
  return {...record, packs: record.packs.map((p) => ({...p, habitIds: p.habitIds.filter((id) => active.has(id))}))};
}

export function packedHabitIds(record: PacksRecord): Set<string> {
  return new Set(record.packs.flatMap((p) => p.habitIds));
}

// Adds a habit to a pack. Unchanged (the same object) if the pack doesn't exist or the habit is in any pack.
export function addToPack(record: PacksRecord, packId: string, habitId: string): PacksRecord {
  const pack = record.packs.find((p) => p.id === packId);
  if (!pack || packedHabitIds(record).has(habitId)) return record;
  return replacePack(record, {...pack, habitIds: [...pack.habitIds, habitId]});
}

// A built-in pack's templates with no active habit of that name in the pack, not dropped, in card order
export function missingTemplates(record: PacksRecord, packId: string, habits: readonly HabitRef[]): TemplateId[] {
  const pack = record.packs.find((p) => p.id === packId);
  if (!pack?.builtinId) return [];
  const byId = new Map(habits.map((h) => [h.habitId, h.habitName]));
  const present = new Set(pack.habitIds.flatMap((id) => {
    const name = byId.get(id);
    return name === undefined ? [] : [normaliseHabitName(name)];
  }));
  return builtinPack(pack.builtinId).templates.filter((t) => !pack.dropped.includes(t) && !present.has(templateKey(t)));
}

// Active habits in no pack whose name is a missing template's join that pack (the first such habit per
// template, in list order). Unchanged (the same object) when nothing joins.
export function adoptExisting(record: PacksRecord, packId: string, habits: readonly HabitRef[]): PacksRecord {
  let next = record;
  for (const template of missingTemplates(record, packId, habits)) {
    const packed = packedHabitIds(next);
    const habit = habits.find((h) => !packed.has(h.habitId) && normaliseHabitName(h.habitName) === templateKey(template));
    if (habit) next = addToPack(next, packId, habit.habitId);
  }
  return next;
}
