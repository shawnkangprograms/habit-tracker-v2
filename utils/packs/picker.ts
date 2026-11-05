// "Choose your habit packs" (app/packs/choose.tsx; docs/PACKS_REPORTS_SPEC.md, section 3, Stage 1b). Pure.
//
// The six built-in packs; the user picks up to the pack limit for their level (utils/packs/limits.ts), counting
// the packs they already have. Packs they already have show as picked and can't be unpicked here (removing a pack
// is stage 2). Saving adds the new packs after the existing ones, and active unpacked habits with a new pack's
// template names join it (trimmed, inner spaces collapsed, case ignored). Nothing else changes.

import {BUILTIN_PACK_IDS, type BuiltinPackId} from '@/utils/packs/builtin';
import {PACK_NAMES} from '@/utils/packs/copy';
import {limitsForLevel} from '@/utils/packs/limits';
import {adoptExisting, type HabitRef} from '@/utils/packs/membership';
import {EMPTY_PACKS, packNameTaken, type PacksRecord, type ParsedPacks} from '@/utils/packs/record';

// The built-in packs the user already has
export function ownedBuiltins(parsed: ParsedPacks): BuiltinPackId[] {
  if (parsed.kind !== 'ok') return [];
  return BUILTIN_PACK_IDS.filter((id) => parsed.record.packs.some((p) => p.builtinId === id));
}

export type PickResult = {picked: BuiltinPackId[]; limited: boolean};

// A tap on a pack. Owned packs never change; a new pick past the limit is refused with `limited`.
export function togglePick(input: {
  picked: readonly BuiltinPackId[];// new picks, not counting owned packs
  id: BuiltinPackId;
  owned: readonly BuiltinPackId[];
  packCount: number;// every pack the user has, built-in or custom
  level: number;
}): PickResult {
  const {picked, id, owned} = input;
  if (owned.includes(id)) return {picked: [...picked], limited: false};
  if (picked.includes(id)) return {picked: picked.filter((p) => p !== id), limited: false};
  if (input.packCount + picked.length >= limitsForLevel(input.level).packs) return {picked: [...picked], limited: true};
  return {picked: BUILTIN_PACK_IDS.filter((p) => p === id || picked.includes(p)), limited: false};// card order
}

// The record to save, or null when there is nothing new. A corrupt record is replaced: saving is the user
// changing something (spec section 2).
export function packsAfterPick(parsed: ParsedPacks, picked: readonly BuiltinPackId[], habits: readonly HabitRef[], now: number): PacksRecord | null {
  const base = parsed.kind === 'ok' ? parsed.record : EMPTY_PACKS;
  // a pack with the same id or name already there is skipped, so the saved record always parses
  const fresh = picked.filter((id) => !base.packs.some((p) => p.builtinId === id || p.id === id) && !packNameTaken(base, PACK_NAMES[id]));
  if (fresh.length === 0) return null;
  let order = base.packs.reduce((max, p) => Math.max(max, p.order + 1), 0);
  let next: PacksRecord = {
    ...base,
    packs: [...base.packs, ...fresh.map((id) => ({
      id, kind: 'builtin' as const, builtinId: id, name: PACK_NAMES[id], habitIds: [], dropped: [], createdAt: now, order: order++,
    }))],
  };
  for (const id of fresh) next = adoptExisting(next, id, habits);
  return next;
}
