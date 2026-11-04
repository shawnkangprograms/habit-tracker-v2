// Pack strings (docs/PACKS_REPORTS_SPEC.md, sections 1 and 2b). Pure. tests/packs-catalog.test.ts checks them
// against the spec, so change the spec and this file together. Pack names stay on the phone.

import type {BuiltinPackId} from '@/utils/packs/builtin';

export const PACK_NAMES: Record<BuiltinPackId, string> = {
  steady_energy: 'Steady Energy',
  calm_mind: 'Calm Mind',
  daily_discipline: 'Daily Discipline',
  career_builder: 'Career Builder',
  study_sprint: 'Study Sprint',
  close_circle: 'Close Circle',
};

// {x}: the lowest level whose limit is higher (utils/packs/limits.ts, nextLimitLevel)
export function habitLimitMessage(level: number): string {
  return `Habit limit reached. Reach level ${level} to add more habits.`;
}

export function packLimitMessage(level: number): string {
  return `Pack limit reached. Reach level ${level} to add more habit packs.`;
}
