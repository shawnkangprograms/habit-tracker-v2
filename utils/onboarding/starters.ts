// Starter habits from the answers (docs/ONBOARDING_SPEC.md, section 4). Local rules, no AI. Pure.
//
// Count: confidence 1-3 gives 2, 4-7 gives 3, 8-10 gives 4, plus the Q10 replace habit if there is one (max 5).
// Order: one template from each axis above 1, highest first (rankAxes), then more from the focus axis, then
// from the next axes in rank order once the focus axis has none left. Sleep struggle or irregular forces one
// sleep template: it takes a free slot, or the last one. Retake passes the catalog ids already added (they are
// left out before picking, so the count holds while templates remain) and the names of the user's habits (a
// replace habit with one of those names is left out, since Q10 is never stored).
//
// Q10 never becomes part of an id: the replace pick's id is always REPLACE_PICK_ID.

import type {IconId} from '@/constants/habits';
import type {HabitInput} from '@/validation/validators';
import {
  REPLACE_NAMES, REPLACE_REASONS, TEMPLATE_NAMES, TEMPLATE_REASONS,
} from '@/utils/onboarding/copy';
import {rankAxes, focusAxis, scoreAxes, AXIS_MIN} from '@/utils/onboarding/scoring';
import {
  REPLACE_ANSWERS, TEMPLATE_IDS, isOneOf, type Axis, type CompleteAnswers, type ReplaceAnswer, type TemplateId,
} from '@/utils/onboarding/types';

export type Template = {id: TemplateId; axis: Axis; habitName: string; icon: IconId; reason: string};

// Icons from the existing set. Known gaps (no fitting icon yet, neutral 'star'): plan_top1, phone_social,
// gaming, procrastination.
const TEMPLATE_DEFS: {id: TemplateId; axis: Axis; icon: IconId}[] = [
  {id: 'walk20', axis: 'Health', icon: 'run'},
  {id: 'stretch10', axis: 'Health', icon: 'heart'},
  {id: 'water_meals', axis: 'Health', icon: 'water'},
  {id: 'lights_out', axis: 'Health', icon: 'sleep'},
  {id: 'screens_off', axis: 'Health', icon: 'sleep'},
  {id: 'breathe5', axis: 'Mind', icon: 'meditate'},
  {id: 'journal3', axis: 'Mind', icon: 'book'},
  {id: 'plan_top1', axis: 'Discipline', icon: 'star'},
  {id: 'focus25', axis: 'Discipline', icon: 'work'},
  {id: 'study25', axis: 'Learning', icon: 'study'},
  {id: 'review10', axis: 'Learning', icon: 'book'},
  {id: 'skill15', axis: 'Career', icon: 'work'},
  {id: 'message_friend', axis: 'Relations', icon: 'heart'},
  {id: 'family_time', axis: 'Relations', icon: 'food'},
];

export const CATALOG: readonly Template[] = TEMPLATE_DEFS.map((t) => ({
  ...t, habitName: TEMPLATE_NAMES[t.id], reason: TEMPLATE_REASONS[t.id],
}));

// In order of preference for the forced sleep pick
export const SLEEP_TEMPLATE_IDS: readonly TemplateId[] = ['lights_out', 'screens_off'];

// Icons for the sensitive answers are neutral too (porn: sleep, smoking_vaping: heart, alcohol: meditate)
const REPLACE_ICONS: Record<ReplaceAnswer, IconId> = {
  phone_social: 'star',
  porn: 'sleep',
  smoking_vaping: 'heart',
  gaming: 'star',
  junk_food: 'food',
  alcohol: 'meditate',
  procrastination: 'star',
};

export const REPLACE_PICK_ID = 'replace';
export const MAX_STARTERS = 5;

export type StarterPick =
  | {kind: 'catalog'; id: TemplateId; habitName: string; icon: IconId; reason: string}
  | {kind: 'replace'; id: typeof REPLACE_PICK_ID; habitName: string; icon: IconId; reason: string};

export function baseStarterCount(confidence: number): number {
  if (confidence <= 3) return 2;
  if (confidence <= 7) return 3;
  return 4;
}

function replaceAnswer(answers: Pick<CompleteAnswers, 'badHabit'>): ReplaceAnswer | null {
  return isOneOf(REPLACE_ANSWERS, answers.badHabit) ? answers.badHabit : null;
}

// Before retake filtering: what a first run with these answers gets
export function starterCount(answers: Pick<CompleteAnswers, 'confidence' | 'badHabit'>): number {
  return Math.min(MAX_STARTERS, baseStarterCount(answers.confidence) + (replaceAnswer(answers) ? 1 : 0));
}

const normalName = (name: string) => name.trim().toLowerCase();

export function pickStarters(
  answers: CompleteAnswers,
  options: {excludeIds?: readonly string[]; existingHabitNames?: readonly string[]} = {},
): StarterPick[] {
  const excluded = new Set(options.excludeIds ?? []);
  const pool = CATALOG.filter((t) => !excluded.has(t.id));
  const scores = scoreAxes(answers);
  const ranked = rankAxes(scores, answers.focus);
  const focus = focusAxis(scores, answers.focus);
  const base = baseStarterCount(answers.confidence);

  const picked: Template[] = [];
  const nextFor = (axis: Axis) => pool.find((t) => t.axis === axis && !picked.includes(t));

  for (const axis of ranked) {
    if (picked.length >= base) break;
    if (scores[axis] <= AXIS_MIN) continue;
    const t = nextFor(axis);
    if (t) picked.push(t);
  }
  for (const axis of [focus, ...ranked.filter((a) => a !== focus)]) {
    for (let t = nextFor(axis); t && picked.length < base; t = nextFor(axis)) picked.push(t);
  }

  if ((answers.sleep === 'struggle' || answers.sleep === 'irregular')
    && !picked.some((t) => SLEEP_TEMPLATE_IDS.includes(t.id))) {
    const sleep = SLEEP_TEMPLATE_IDS.map((id) => pool.find((t) => t.id === id)).find((t) => t !== undefined);
    if (sleep) {
      if (picked.length < base) picked.push(sleep);
      else picked[picked.length - 1] = sleep;
    }
  }

  const picks: StarterPick[] = picked.map((t) => ({
    kind: 'catalog', id: t.id, habitName: t.habitName, icon: t.icon, reason: t.reason,
  }));

  const replace = replaceAnswer(answers);
  const existing = new Set((options.existingHabitNames ?? []).map(normalName));
  if (replace && !existing.has(normalName(REPLACE_NAMES[replace]))) {
    picks.push({
      kind: 'replace', id: REPLACE_PICK_ID, habitName: REPLACE_NAMES[replace], icon: REPLACE_ICONS[replace],
      reason: REPLACE_REASONS[replace],
    });
  }
  return picks.slice(0, MAX_STARTERS);
}

// The add-habit input for one picked card: daily, with the routine screen's reminder time (or none)
export function toHabitInput(pick: StarterPick, reminderTime: string | null): HabitInput {
  return {
    habitName: pick.habitName,
    icon: pick.icon,
    frequency: {type: 'daily'},
    reminderTime,
    alarm: false,
    remindBeforeMin: 0,
  };
}

// The ids a finished plan adds to the record's addedTemplateIds: catalog ids only, never the replace pick
export function addedTemplateIdsOf(picks: readonly StarterPick[]): TemplateId[] {
  return picks.flatMap((p) => (p.kind === 'catalog' && isOneOf(TEMPLATE_IDS, p.id) ? [p.id] : []));
}
