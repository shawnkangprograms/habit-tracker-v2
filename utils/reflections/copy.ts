// Reflection strings (docs/PACKS_REPORTS_SPEC.md, sections 12 and 16; approved in the Stage 3 plan). Pure.
// tests/reflections.test.ts checks them against the approved wording, so change both together.

import {REFLECTION_XP} from '@/utils/gamification';

// ---------- The bar at the bottom of Home ----------

export const BAR_REWARD = `+${REFLECTION_XP} XP`;
export const BAR_BUTTON = 'Reflect';
export const BAR_HINT = 'Opens a short reflection';

export function barText(habitName: string): string {
  return `${habitName} done. Reflect on it?`;
}

export function barLabel(habitName: string): string {
  return `Reflect on ${habitName} for ${REFLECTION_XP} XP`;
}

export function barAnnouncement(habitName: string): string {
  return `${habitName} done. Reflect on it for ${REFLECTION_XP} XP from the button at the bottom of the screen.`;
}

// ---------- The reflection screen ----------

export const SCREEN_TITLE = 'Reflect';
export const SCREEN_BACK = 'Home';
export const SCREEN_INTRO = 'Four quick taps.';
export const TEXT_LABEL = 'ANYTHING ELSE? (OPTIONAL)';
export const TEXT_PLACEHOLDER = 'A few words for yourself';
export const TEXT_TOO_LONG = 'Use 200 characters or fewer.';
export const REWARD_LINE = `+${REFLECTION_XP} XP for answering the four questions.`;
export const NO_REWARD_LINE = "This one won't earn XP today.";
export const SAVE_BUTTON = 'Save reflection';
export const SAVE_HINT_DISABLED = 'Answer the four questions to save.';
export const DISCARD_TITLE = 'Discard this reflection?';
export const DISCARD_BODY = "Your answers won't be saved.";
export const DISCARD_CONFIRM = 'Discard';
export const DISCARD_CANCEL = 'Keep editing';
export const SAVE_FAILED_TITLE = "Couldn't save reflection";
export const SAVE_FAILED_BODY = 'Something went wrong. Please try again.';
export const ALREADY_TITLE = 'Already reflected';
export const ALREADY_BODY = "You've already reflected on this habit today.";

export function textCounter(length: number, max: number): string {
  return `${length}/${max}`;
}

// ---------- The toast on Home after saving ----------

export const SAVED_REWARDED = [`Reflection saved. +${REFLECTION_XP} XP.`, `Saved. +${REFLECTION_XP} XP for reflecting.`] as const;
export const SAVED_PLAIN = 'Reflection saved.';
