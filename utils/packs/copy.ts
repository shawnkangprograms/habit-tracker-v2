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

// hasHabits: false for a pack with no active habits at all ("No habits yet", Stage 2)
export function packProgress(done: number, total: number, hasHabits = true): string {
  if (!hasHabits) return NO_HABITS_YET;
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

// {x}: the lowest level whose limit is higher than both the current limit and the current count
// (utils/packs/limits.ts, nextLimitLevel and limitMessageFor)
export function habitLimitMessage(level: number): string {
  return `Habit limit reached. Reach level ${level} to add more habits.`;
}

export function packLimitMessage(level: number): string {
  return `Pack limit reached. Reach level ${level} to add more habit packs.`;
}

// ---------- Stage 2: create, edit and delete packs, the habit form's pack row (approved strings) ----------

export const NO_HABITS_YET = 'No habits yet';
export const CREATE_PACK_BUTTON = 'Create a habit pack';// Home, directly above "Add a habit"
export const CREATE_OWN_PACK = 'Create your own pack';// the picker
export const EDIT_PACK = 'Edit pack';// the pack card's action
export const NEW_PACK_TITLE = 'New pack';
export const EDIT_PACK_TITLE = 'Edit pack';
export const PACK_NAME_LABEL = 'PACK NAME';
export const AREA_LABEL = 'AREA';
export const HABITS_LABEL = 'HABITS';
export const HABIT_PACK_LABEL = 'HABIT PACK';// the habit form
export const NO_PACK = 'None';
export const PACK_NAME_PLACEHOLDER = 'e.g. Morning routine';
export const AREA_LOCKED_NOTE = "You can't change the area later.";
export const NO_HABITS_TO_ADD = 'No habits to add yet. You can add some later.';
export const CREATE_PACK_SAVE = 'Create pack';
export const SAVE_CHANGES = 'Save changes';
export const DELETE_PACK = 'Delete pack';
export const DELETE_PACK_TITLE = 'Delete this pack?';
export const DELETE_PACK_BODY = 'Its habits stay on your Home screen under Habits.';
export const CANCEL = 'Cancel';
export const SAVE_PACK_FAILED = "Couldn't save pack";
export const DELETE_PACK_FAILED = "Couldn't delete pack";
export const TRY_AGAIN = 'Something went wrong. Please try again.';
export const PACK_NOT_FOUND_TITLE = 'Pack not found';
export const PACK_NOT_FOUND_BODY = 'This pack no longer exists.';
export const PACK_NAME_EMPTY = 'Give your pack a name.';
export const PACK_NAME_LONG = 'Use 24 characters or fewer.';
export const PACK_NAME_TAKEN = 'You already have a pack with that name.';

export function inPack(name: string): string {
  return `In ${name}`;
}

export function editPackLabel(name: string): string {
  return `${EDIT_PACK}, ${name}`;
}
