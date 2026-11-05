// Which radar area a habit counts toward (docs/PACKS_REPORTS_SPEC.md, section 11). Pure.
//
// First match wins:
// 1. its pack's area (a built-in pack's own, or a custom pack's stored one)
// 2. for a habit in no pack, or in a custom pack with no area: the value stored on this phone in
//    areas:v1:<uid> (an area, or 'none' = Not counted)
// 3. the icon pre-fill below (a habit never given an area, or one pulled onto a new phone: the map is on-device only)
// Discipline has no icon of its own, so it is only ever chosen by hand or through a pack.

import {packArea} from '@/utils/packs/manage';
import type {PacksRecord} from '@/utils/packs/record';
import {AXES, type Axis} from '@/utils/onboarding/types';

export type AreaValue = Axis | 'none';// 'none': Not counted
export type AreasMap = Record<string, AreaValue>;// habitId -> area, unpacked habits only

// Approved in the Stage 5 plan. star (and any unknown icon) is Not counted.
export const ICON_AREA: Readonly<Record<string, Axis>> = {
  run: 'Health', water: 'Health', food: 'Health', sleep: 'Health',
  meditate: 'Mind', music: 'Mind',
  work: 'Career', money: 'Career',
  book: 'Learning', study: 'Learning',
  heart: 'Relations',
};

export function isAreaValue(value: unknown): value is AreaValue {
  return value === 'none' || (AXES as readonly unknown[]).includes(value);
}

// The icon's area, or 'none'
export function iconArea(icon: string): AreaValue {
  return ICON_AREA[icon] ?? 'none';
}

// habitId -> its pack's area (null: the pack has none). Habits in no pack are absent.
export function packAreas(record: PacksRecord | null): Map<string, Axis | null> {
  const out = new Map<string, Axis | null>();
  for (const pack of record?.packs ?? []) {
    const area = packArea(pack);
    for (const id of pack.habitIds) out.set(id, area);
  }
  return out;
}

export function resolveArea(
  habit: {habitId: string; icon: string},
  byPack: ReadonlyMap<string, Axis | null>,
  areas: AreasMap,
): Axis | null {
  const fromPack = byPack.get(habit.habitId);
  if (fromPack) return fromPack;
  const stored = areas[habit.habitId];
  const value = isAreaValue(stored) ? stored : iconArea(habit.icon);
  return value === 'none' ? null : value;
}
