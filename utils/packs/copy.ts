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

// ---------- Stage 1b: Home, the choose card, the picker and Settings (approved strings) ----------

export const HOME_PACKS_TITLE = 'Habit packs';
export const HOME_HABITS_TITLE = 'Habits';
export const NOTHING_TODAY = 'Nothing scheduled today';
export const ADD_REST = 'Add the rest';
export const ADDING = 'Adding…';
export const ADD_REST_FAILED = "Couldn't add every habit. Tap Add the rest to try again.";
export const CHOOSE_CARD_TITLE = 'Choose your habit packs';
export const CHOOSE_CARD_BUTTON = 'Choose packs';
export const CHOOSE_CARD_LATER = 'Not now';
export const CHOOSE_ADOPT_NOTE = 'Habits you already have with these names join their pack.';
export const SAVE_PACKS = 'Save packs';
export const SETTINGS_PACKS_ROW = 'Habit packs';

export function packProgress(done: number, total: number): string {
  return total === 0 ? NOTHING_TODAY : `${done} of ${total} done today`;
}

// {n}: the pack limit for the user's level (utils/packs/limits.ts), never a fixed number
export function chooseCardBody(limit: number): string {
  return `Group your habits into up to ${limit} packs.`;
}

export function chooseTitle(limit: number): string {
  return `Pick up to ${limit} packs`;
}

export function habitCount(n: number): string {
  return `${n} habits`;
}

// {x}: the lowest level whose limit is higher (utils/packs/limits.ts, nextLimitLevel)
export function habitLimitMessage(level: number): string {
  return `Habit limit reached. Reach level ${level} to add more habits.`;
}

export function packLimitMessage(level: number): string {
  return `Pack limit reached. Reach level ${level} to add more habit packs.`;
}
