// Choosing packs after onboarding, and what an onboarding run writes to the pack record
// (docs/PACKS_REPORTS_SPEC.md, section 3). Pure.
//
// The two packs: the focus axis's pack (the axis the Habit Profile names), then the pack of the highest remaining
// score, ties broken in the fixed order Health, Mind, Discipline, Career, Learning, Relations. Only these two pack
// ids reach storage; the scores and answers never do.
//
// A run creates the two packs when it has created at least one habit and the user has no packs (no record, or
// one with no packs): a first run, a Settings run after a skip, or an account that finished onboarding before
// packs existed. When the user already has packs, a run only adds starters to built-in packs they have and never
// creates new ones. A corrupt record is never written over. Skip never reaches this module. A starter joins the pack its template belongs to when that pack exists and the template is not
// dropped from it; every other pick (the forced sleep pick from another pack, a retake fill-in, the Q10 replace
// pick, the user's own habit) is an "other habit". When the run creates the packs, active unpacked habits that
// already have a template's name join too (adoption), instead of a duplicate being offered later.

import {packForArea, packOfTemplate, type BuiltinPackId} from '@/utils/packs/builtin';
import {PACK_NAMES} from '@/utils/packs/copy';
import {addToPack, adoptExisting, type HabitRef} from '@/utils/packs/membership';
import {PACKS_VERSION, type PacksRecord, type ParsedPacks} from '@/utils/packs/record';
import {TEMPLATE_NAMES} from '@/utils/onboarding/copy';
import {focusAxis, type Scores} from '@/utils/onboarding/scoring';
import type {StarterPick} from '@/utils/onboarding/starters';
import {TEMPLATE_IDS, isOneOf, type Axis, type FocusArea, type TemplateId} from '@/utils/onboarding/types';

export const PACK_TIE_ORDER: readonly Axis[] = ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations'];

export function chooseOnboardingPacks(scores: Scores, focus: readonly FocusArea[]): [BuiltinPackId, BuiltinPackId] {
  const first = focusAxis(scores, focus);
  const rest = PACK_TIE_ORDER.filter((axis) => axis !== first);
  const second = rest.reduce((best, axis) => (scores[axis] > scores[best] ? axis : best));// strict: ties keep the order
  return [packForArea(first), packForArea(second)];
}

// Does this record leave room for a run to create the packs? (no record, or one with no packs)
export function hasNoPacks(parsed: ParsedPacks): boolean {
  return parsed.kind === 'none' || (parsed.kind === 'ok' && parsed.record.packs.length === 0);
}

// The packs a run works with: the stored packs, or the two new packs when this run creates them, or null when
// starters join no pack (no habit created yet with no packs, or a corrupt record)
export function runPacks(parsed: ParsedPacks, chosen: readonly BuiltinPackId[], create: boolean, now: number): PacksRecord | null {
  if (parsed.kind === 'corrupt') return null;
  if (!hasNoPacks(parsed)) return parsed.kind === 'ok' ? parsed.record : null;
  if (!create) return null;
  return {
    version: PACKS_VERSION,
    packs: chosen.map((id, order) => ({
      id, kind: 'builtin', builtinId: id, name: PACK_NAMES[id], habitIds: [], dropped: [], createdAt: now, order,
    })),
  };
}

// The pack a template's starter joins, or null for an "other habit"
export function joinTarget(record: PacksRecord | null, templateId: TemplateId): string | null {
  const builtinId = packOfTemplate(templateId);
  const pack = record?.packs.find((p) => p.builtinId === builtinId && !p.dropped.includes(templateId));
  return pack?.id ?? null;
}

export type RunJoin = {templateId: TemplateId; habitId: string};// a starter created in this run

// The record to save at each moment the onboarding record is saved, or null when nothing changes (or nothing
// may be written). Idempotent: called again with more joins, it only adds the new ones.
export function packsAfterRun(parsed: ParsedPacks, run: {
  chosen: readonly BuiltinPackId[];
  create: boolean;// this run has created at least one habit (a starter or the user's own)
  joins: readonly RunJoin[];
  existing: readonly HabitRef[];// the active habits read when the plan was built (adoption)
  now: number;
}): PacksRecord | null {
  const base = runPacks(parsed, run.chosen, run.create, run.now);
  if (!base) return null;
  let next = base;
  for (const join of run.joins) {
    const target = joinTarget(next, join.templateId);
    if (target) next = addToPack(next, target, join.habitId);
  }
  const creating = hasNoPacks(parsed);
  if (creating) {
    // starters made in this run count as present, so an older habit with the same name isn't adopted as well
    const known = [...run.existing, ...run.joins.map((j) => ({habitId: j.habitId, habitName: TEMPLATE_NAMES[j.templateId]}))];
    for (const pack of next.packs) next = adoptExisting(next, pack.id, known);
  }
  return creating || next !== base ? next : null;
}

export type RoutineGroups = {
  packs: {packId: string; name: string; picks: StarterPick[]}[];// non-empty groups, the chosen packs first
  other: StarterPick[];
  subtitle: [string, string] | null;// both chosen packs' names, when the run uses both
};

// The routine screen's groups: each pick under the pack it will join, the rest under "Other habits"
export function routineGroups(picks: readonly StarterPick[], record: PacksRecord | null, chosen: readonly BuiltinPackId[]): RoutineGroups {
  const byPack = new Map<string, StarterPick[]>();
  const other: StarterPick[] = [];
  for (const pick of picks) {
    const target = pick.kind === 'catalog' && isOneOf(TEMPLATE_IDS, pick.id) ? joinTarget(record, pick.id) : null;
    if (target) byPack.set(target, [...(byPack.get(target) ?? []), pick]);
    else other.push(pick);
  }
  const packs = record?.packs ?? [];
  const rank = (builtinId: string | undefined) => {
    const i = chosen.indexOf(builtinId as BuiltinPackId);
    return i === -1 ? chosen.length : i;
  };
  const ordered = packs.map((p, i) => ({p, i})).sort((a, b) => rank(a.p.builtinId) - rank(b.p.builtinId) || a.i - b.i);
  const chosenPacks = chosen.map((id) => packs.find((p) => p.builtinId === id));
  return {
    packs: ordered.flatMap(({p}) => (byPack.has(p.id) ? [{packId: p.id, name: p.name, picks: byPack.get(p.id)!}] : [])),
    other,
    subtitle: chosenPacks.length === 2 && chosenPacks[0] && chosenPacks[1] ? [chosenPacks[0].name, chosenPacks[1].name] : null,
  };
}
