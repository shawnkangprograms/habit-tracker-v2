// Starter habits from the answers (docs/ONBOARDING_SPEC.md, section 4, and docs/PACKS_REPORTS_SPEC.md, section 1).
// Local rules, no AI. Pure.
//
// Count: confidence 1-3 gives 2, 4-7 gives 3, 8-10 gives 4, plus the Q10 replace habit if there is one (max 5).
// Pool: the two packs chosen from the scores (utils/packs/choose.ts), their templates taken in turn: the focus
// pack's first, the second pack's first, the focus pack's second, and so on. Only when every template left in
// both packs is already picked (a retake) does the rest of the catalog fill in, by area rank. Sleep struggle or
// irregular forces one sleep template, from Calm Mind even when that pack wasn't chosen: it takes a free slot, or
// the last one. Retake passes the catalog ids already added and the names of the user's active habits: a template
// in either is left out before picking (a template habit made by "Add the rest", the packs picker or by hand is
// not in addedTemplateIds), and a replace habit with one of those names is left out, since Q10 is never stored.
// Names are compared with normaliseHabitName (trimmed, inner spaces collapsed, case ignored).
//
// Time budget (Q1): no single catalog pick longer than the budget's `single` cap, and the catalog picks together
// at most its `total` cap (twice the budget). A template that doesn't fit is skipped and picking continues down
// the same order, so a small budget can give fewer picks than the count. The Q10 replace pick is exempt.
//
// Which picks join a pack is decided by utils/packs/choose.ts (routineGroups, packsAfterRun).
//
// Q10 never becomes part of an id: the replace pick's id is always REPLACE_PICK_ID.

import type {IconId} from '@/constants/habits';
import type {HabitInput} from '@/validation/validators';
import {
  REPLACE_NAMES, REPLACE_REASONS, TEMPLATE_NAMES, TEMPLATE_REASONS,
} from '@/utils/onboarding/copy';
import {rankAxes, scoreAxes} from '@/utils/onboarding/scoring';
import {builtinPack} from '@/utils/packs/builtin';
import {chooseOnboardingPacks} from '@/utils/packs/choose';
import {normaliseHabitName} from '@/utils/packs/membership';
import {
  REPLACE_ANSWERS, TEMPLATE_IDS, isOneOf, type Axis, type CompleteAnswers, type ReplaceAnswer, type TemplateId,
  type TimeBudget,
} from '@/utils/onboarding/types';

// minutes: a typical day's time; habits that take no real time (lights out, water with meals) are 1.
// axis: the onboarding axis from ONBOARDING_SPEC section 4 (catalog data only). area: the template's pack's area
// (PACKS_REPORTS_SPEC section 1), used for packs, the fill-in rank and, later, the radar. They differ for
// lights_out and screens_off (axis Health, area Mind) and focus25 (axis Discipline, area Career).
export type Template = {
  id: TemplateId; axis: Axis; area: Axis; habitName: string; icon: IconId; reason: string; minutes: number;
};

// Icons from the existing set. Known gaps (no fitting icon yet, neutral 'star'): plan_top1, tidy5, work_win,
// phone_social, gaming, procrastination.
const TEMPLATE_DEFS: {id: TemplateId; axis: Axis; area: Axis; icon: IconId; minutes: number}[] = [
  {id: 'walk20', axis: 'Health', area: 'Health', icon: 'run', minutes: 20},
  {id: 'stretch10', axis: 'Health', area: 'Health', icon: 'heart', minutes: 10},
  {id: 'water_meals', axis: 'Health', area: 'Health', icon: 'water', minutes: 1},
  {id: 'lights_out', axis: 'Health', area: 'Mind', icon: 'sleep', minutes: 1},
  {id: 'screens_off', axis: 'Health', area: 'Mind', icon: 'sleep', minutes: 1},
  {id: 'breathe5', axis: 'Mind', area: 'Mind', icon: 'meditate', minutes: 5},
  {id: 'journal3', axis: 'Mind', area: 'Mind', icon: 'book', minutes: 5},
  {id: 'plan_top1', axis: 'Discipline', area: 'Discipline', icon: 'star', minutes: 5},
  {id: 'focus25', axis: 'Discipline', area: 'Career', icon: 'work', minutes: 25},
  {id: 'study25', axis: 'Learning', area: 'Learning', icon: 'study', minutes: 25},
  {id: 'review10', axis: 'Learning', area: 'Learning', icon: 'book', minutes: 10},
  {id: 'skill15', axis: 'Career', area: 'Career', icon: 'work', minutes: 15},
  {id: 'message_friend', axis: 'Relations', area: 'Relations', icon: 'heart', minutes: 5},
  {id: 'family_time', axis: 'Relations', area: 'Relations', icon: 'food', minutes: 30},
  {id: 'eat_produce', axis: 'Health', area: 'Health', icon: 'food', minutes: 1},
  {id: 'make_bed', axis: 'Discipline', area: 'Discipline', icon: 'sleep', minutes: 2},
  {id: 'tidy5', axis: 'Discipline', area: 'Discipline', icon: 'star', minutes: 5},
  {id: 'set_out_essentials', axis: 'Discipline', area: 'Discipline', icon: 'work', minutes: 5},
  {id: 'work_win', axis: 'Career', area: 'Career', icon: 'star', minutes: 2},
  {id: 'reach_out', axis: 'Career', area: 'Career', icon: 'work', minutes: 5},
  {id: 'read15', axis: 'Learning', area: 'Learning', icon: 'book', minutes: 15},
  {id: 'teach_back', axis: 'Learning', area: 'Learning', icon: 'study', minutes: 5},
  {id: 'thank_someone', axis: 'Relations', area: 'Relations', icon: 'heart', minutes: 1},
  {id: 'kind_act', axis: 'Relations', area: 'Relations', icon: 'heart', minutes: 5},
];

// The replace habits' minutes (approved with the catalog's; the replace pick itself is exempt from the caps)
export const REPLACE_MINUTES: Record<ReplaceAnswer, number> = {
  phone_social: 1, porn: 1, smoking_vaping: 5, gaming: 1, junk_food: 30, alcohol: 1, procrastination: 5,
};

export const BUDGET_CAPS: Record<TimeBudget, {single: number; total: number}> = {
  min5: {single: 5, total: 10},
  min15: {single: 15, total: 30},
  min30: {single: 30, total: 60},
  min60: {single: Infinity, total: Infinity},
};

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

export function pickStarters(
  answers: CompleteAnswers,
  options: {excludeIds?: readonly string[]; existingHabitNames?: readonly string[]} = {},
): StarterPick[] {
  const excluded = new Set(options.excludeIds ?? []);
  const existing = new Set((options.existingHabitNames ?? []).map(normaliseHabitName));
  const pool = CATALOG.filter((t) => !excluded.has(t.id) && !existing.has(normaliseHabitName(t.habitName)));
  const scores = scoreAxes(answers);
  const ranked = rankAxes(scores, answers.focus);
  const base = baseStarterCount(answers.confidence);
  const caps = BUDGET_CAPS[answers.timeBudget];

  const picked: Template[] = [];
  const total = () => picked.reduce((sum, t) => sum + t.minutes, 0);
  const fits = (t: Template) => t.minutes <= caps.single && total() + t.minutes <= caps.total;
  const take = (list: readonly Template[]) => {
    for (const t of list) {
      if (picked.length >= base) return;
      if (!picked.includes(t) && fits(t)) picked.push(t);
    }
  };

  const [first, second] = chooseOnboardingPacks(scores, answers.focus).map((id) => builtinPack(id).templates);
  const inTurn = first.flatMap((id, i) => [id, second[i]]).flatMap((id) => pool.filter((t) => t.id === id));
  take(inTurn);
  if (inTurn.every((t) => picked.includes(t))) {
    // both packs used up: the rest of the catalog by area rank (a stable sort keeps catalog order within an area)
    take([...pool].sort((a, b) => ranked.indexOf(a.area) - ranked.indexOf(b.area)));
  }

  if ((answers.sleep === 'struggle' || answers.sleep === 'irregular')
    && !picked.some((t) => SLEEP_TEMPLATE_IDS.includes(t.id))) {
    // sleep templates take 1 minute, the least any template takes, so taking the last slot never breaks the caps
    const sleep = SLEEP_TEMPLATE_IDS.map((id) => pool.find((t) => t.id === id)).find((t) => t !== undefined);
    if (sleep) {
      if (picked.length < base && fits(sleep)) picked.push(sleep);
      else picked[picked.length - 1] = sleep;
    }
  }

  const picks: StarterPick[] = picked.map((t) => ({
    kind: 'catalog', id: t.id, habitName: t.habitName, icon: t.icon, reason: t.reason,
  }));

  const replace = replaceAnswer(answers);
  if (replace && !existing.has(normaliseHabitName(REPLACE_NAMES[replace]))) {
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
