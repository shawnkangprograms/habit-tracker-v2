// The six built-in habit packs (docs/PACKS_REPORTS_SPEC.md, section 1). Pure: no React, storage or Firebase
// (eslint.config.js and tests/packs-isolation.test.ts). A template is in exactly one pack, and its `area` in the
// catalog (utils/onboarding/starters.ts) is always its pack's area. The names are in utils/packs/copy.ts.

import type {Axis, TemplateId} from '@/utils/onboarding/types';

export const BUILTIN_PACK_IDS = [
  'steady_energy', 'calm_mind', 'daily_discipline', 'career_builder', 'study_sprint', 'close_circle',
] as const;
export type BuiltinPackId = (typeof BUILTIN_PACK_IDS)[number];

export type BuiltinPack = {id: BuiltinPackId; area: Axis; templates: readonly TemplateId[]};

// Templates in card order: "Add the rest" and the starter picker go down them in this order
export const BUILTIN_PACKS: readonly BuiltinPack[] = [
  {id: 'steady_energy', area: 'Health', templates: ['walk20', 'stretch10', 'water_meals', 'eat_produce']},
  {id: 'calm_mind', area: 'Mind', templates: ['breathe5', 'journal3', 'lights_out', 'screens_off']},
  {id: 'daily_discipline', area: 'Discipline', templates: ['plan_top1', 'make_bed', 'tidy5', 'set_out_essentials']},
  {id: 'career_builder', area: 'Career', templates: ['focus25', 'skill15', 'work_win', 'reach_out']},
  {id: 'study_sprint', area: 'Learning', templates: ['study25', 'review10', 'read15', 'teach_back']},
  {id: 'close_circle', area: 'Relations', templates: ['message_friend', 'family_time', 'thank_someone', 'kind_act']},
];

export function builtinPack(id: BuiltinPackId): BuiltinPack {
  return BUILTIN_PACKS.find((p) => p.id === id)!;
}

export function packForArea(area: Axis): BuiltinPackId {
  return BUILTIN_PACKS.find((p) => p.area === area)!.id;
}

// The built-in pack a template belongs to (every template has exactly one)
export function packOfTemplate(id: TemplateId): BuiltinPackId {
  return BUILTIN_PACKS.find((p) => p.templates.includes(id))!.id;
}

export function isBuiltinPackId(value: unknown): value is BuiltinPackId {
  return typeof value === 'string' && (BUILTIN_PACK_IDS as readonly string[]).includes(value);
}
