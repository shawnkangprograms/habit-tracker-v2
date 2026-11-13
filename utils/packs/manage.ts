// Creating, editing and deleting packs, and moving habits between them (docs/PACKS_REPORTS_SPEC.md, sections 2
// and 4, Stage 2). Pure; records are never changed in place.
//
// A habit is in at most one pack: putting it in one takes it out of any other. Taking a habit out of a built-in
// pack (unticking it, or moving it elsewhere) puts its template in that pack's `dropped`, so "Add the rest"
// never brings a copy back; putting it back takes the template out of `dropped`. Habits are never deleted with
// a pack. A pack's area is fixed once it is made (the radar history depends on it).

import {builtinPack} from '@/utils/packs/builtin';
import {PACK_NAME_EMPTY, PACK_NAME_LONG, PACK_NAME_TAKEN} from '@/utils/packs/copy';
import {normaliseHabitName, type HabitRef} from '@/utils/packs/membership';
import {EMPTY_PACKS, packNameTaken, validatePackName, type Pack, type PacksRecord, type ParsedPacks} from '@/utils/packs/record';
import {TEMPLATE_NAMES} from '@/utils/onboarding/copy';
import type {Axis, TemplateId} from '@/utils/onboarding/types';

// The order the areas are offered in (the pack tie-break order, utils/packs/choose.ts)
export const AREA_ORDER: readonly Axis[] = ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations'];

// Control characters (a pasted line break, say) turned into spaces, trimmed, inner spaces collapsed: the name as
// it would be saved
export function normalisePackName(raw: string): string {
  return raw.replace(/\p{Cc}/gu, ' ').trim().replace(/\s+/g, ' ');
}

// The inline error for a pack name, or null when it can be saved. exceptId: the pack being edited.
export function packNameError(raw: string, record: PacksRecord, exceptId?: string): string | null {
  const name = validatePackName(normalisePackName(raw));
  if (!name.valid) return name.reason === 'long' ? PACK_NAME_LONG : PACK_NAME_EMPTY;
  return packNameTaken(record, name.value, exceptId) ? PACK_NAME_TAKEN : null;
}

export function packArea(pack: Pack): Axis | null {
  return pack.builtinId ? builtinPack(pack.builtinId).area : (pack.area ?? null);
}

// The pack a habit is in, if any
export function packOf(record: PacksRecord, habitId: string): Pack | null {
  return record.packs.find((p) => p.habitIds.includes(habitId)) ?? null;
}

// The record a change starts from: a corrupt record is replaced, since saving is the user changing something
export function baseRecord(parsed: ParsedPacks): PacksRecord {
  return parsed.kind === 'ok' ? parsed.record : EMPTY_PACKS;
}

// The built-in pack's template with this habit's name, if any
function templateOf(pack: Pack, habitName: string): TemplateId | null {
  if (!pack.builtinId) return null;
  const key = normaliseHabitName(habitName);
  return builtinPack(pack.builtinId).templates.find((t) => normaliseHabitName(TEMPLATE_NAMES[t]) === key) ?? null;
}

// Moves a habit into a pack (null: out of every pack). Unchanged (the same object) if it is already there or the
// target pack doesn't exist.
export function moveHabit(record: PacksRecord, habit: HabitRef, toPackId: string | null): PacksRecord {
  const from = packOf(record, habit.habitId);
  if ((from?.id ?? null) === toPackId) return record;
  if (toPackId !== null && !record.packs.some((p) => p.id === toPackId)) return record;
  return {
    ...record,
    packs: record.packs.map((p) => {
      const template = templateOf(p, habit.habitName);
      if (p.id === from?.id) {
        const dropped = template && !p.dropped.includes(template) ? [...p.dropped, template] : p.dropped;
        return {...p, habitIds: p.habitIds.filter((id) => id !== habit.habitId), dropped};
      }
      if (p.id === toPackId) {
        return {...p, habitIds: [...p.habitIds, habit.habitId], dropped: p.dropped.filter((t) => t !== template)};
      }
      return p;
    }),
  };
}

// ---------- P-2: a template habit renamed or deleted leaves its built-in pack's templates ----------
// (docs/PACKS_REPORTS_SPEC.md, section 17). Templates count as present by name (membership.ts missingTemplates), so
// once the only habit carrying a template's name is renamed away or deleted, "Add the rest" would create that template
// again. These put it in the pack's `dropped`, the same rule as moving a habit out; renaming a habit back to a template's
// name takes that template out (putting it back). Only for a built-in pack holding the habit; a name change of case or
// spacing only changes nothing. `active`: every active habit (one read at the time of the change). Unchanged (the same
// object) when nothing changes. Known gaps: renames and deletes made on another phone (pulled; pack records aren't
// synced), and renames made before P-2 shipped.

// Does another active member of this pack carry this template's name?
function carriedByOther(pack: Pack, habitId: string, template: TemplateId, active: readonly HabitRef[]): boolean {
  const members = new Set(pack.habitIds.filter((id) => id !== habitId));
  const key = normaliseHabitName(TEMPLATE_NAMES[template]);
  return active.some((h) => members.has(h.habitId) && normaliseHabitName(h.habitName) === key);
}

function withDropped(record: PacksRecord, pack: Pack, dropped: TemplateId[]): PacksRecord {
  return {...record, packs: record.packs.map((p) => (p.id === pack.id ? {...p, dropped} : p))};
}

export function renameInPack(
  record: PacksRecord,
  rename: {habitId: string; oldName: string; newName: string},
  active: readonly HabitRef[],
): PacksRecord {
  const pack = packOf(record, rename.habitId);
  if (!pack || pack.kind !== 'builtin') return record;
  if (normaliseHabitName(rename.oldName) === normaliseHabitName(rename.newName)) return record;
  const before = templateOf(pack, rename.oldName);
  const after = templateOf(pack, rename.newName);
  let dropped = pack.dropped;
  if (before && before !== after && !dropped.includes(before) && !carriedByOther(pack, rename.habitId, before, active)) {
    dropped = [...dropped, before];
  }
  if (after && dropped.includes(after)) dropped = dropped.filter((t) => t !== after);
  return dropped === pack.dropped ? record : withDropped(record, pack, dropped);
}

// A deleted habit (its name as it was): ids of deleted habits are ignored on read, so only `dropped` changes
export function deleteFromPack(
  record: PacksRecord,
  habit: HabitRef,
  active: readonly HabitRef[],
): PacksRecord {
  const pack = packOf(record, habit.habitId);
  if (!pack || pack.kind !== 'builtin') return record;
  const template = templateOf(pack, habit.habitName);
  if (!template || pack.dropped.includes(template) || carriedByOther(pack, habit.habitId, template, active)) return record;
  return withDropped(record, pack, [...pack.dropped, template]);
}

export type PackEdit = {
  name: string;// as typed; saved normalised
  area: Axis | null;// used when the pack has none yet (a new pack, or a custom pack that lost it)
  habitIds: readonly string[];// the ticked habits
};

// Saves a pack from the edit screen. packId: the pack being edited, or null to create one with newId. habits:
// every active habit (ticked ids that aren't active are ignored). Null if the name can't be saved, a new pack
// has no area, or the edited pack no longer exists.
export function savePack(record: PacksRecord, input: PackEdit & {
  packId: string | null;
  newId: string;
  habits: readonly HabitRef[];
  now: number;
}): PacksRecord | null {
  if (packNameError(input.name, record, input.packId ?? undefined) !== null) return null;
  const name = normalisePackName(input.name);
  let next: PacksRecord;
  let id: string;
  if (input.packId === null) {
    if (input.area === null) return null;
    id = input.newId;
    const order = record.packs.reduce((max, p) => Math.max(max, p.order + 1), 0);
    next = {...record, packs: [...record.packs, {
      id, kind: 'custom', name, habitIds: [], dropped: [], createdAt: input.now, order, area: input.area,
    }]};
  } else {
    const pack = record.packs.find((p) => p.id === input.packId);
    if (!pack) return null;
    id = pack.id;
    const area = pack.kind === 'custom' && !pack.area && input.area ? {area: input.area} : {};
    next = {...record, packs: record.packs.map((p) => (p.id === id ? {...p, name, ...area} : p))};
  }

  const ticked = new Set(input.habitIds);
  const current = next.packs.find((p) => p.id === id)!.habitIds;
  for (const habit of input.habits) {
    if (ticked.has(habit.habitId)) next = moveHabit(next, habit, id);
    else if (current.includes(habit.habitId)) next = moveHabit(next, habit, null);
  }
  return next;
}

// Deletes a pack. Its habits stay, unpacked. Unchanged (the same object) if it doesn't exist.
export function deletePack(record: PacksRecord, packId: string): PacksRecord {
  if (!record.packs.some((p) => p.id === packId)) return record;
  return {...record, packs: record.packs.filter((p) => p.id !== packId)};
}
