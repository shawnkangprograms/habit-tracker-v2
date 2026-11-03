// The plan after Q11 and the habit creation for the Recommended Routine screen (docs/ONBOARDING_SPEC.md,
// sections 4 and 5). Pure: the add-habit call and the record save are injected, so the write rules are tested
// under Node.
//
// When the record is written:
// - never before the results: nothing is saved while the questions or result screens are open;
// - right after the FIRST habit is created (a finished record), then again after each further habit, each time
//   with that habit's template id added to addedTemplateIds (catalog ids only; never the Q10 replace pick);
// - if nothing was selected (or nothing was left to pick), when the user presses Start / Done: the user
//   deliberately created none;
// - a failed creation stops the run before anything else is saved, so no path leaves a finished record with
//   zero habits unless the user chose none. The app being killed before the first habit saves nothing.

import type {HabitInput} from '@/validation/validators';
import {completedRecord, withAddedTemplates, type OnboardingRecord, type ParsedRecord} from '@/utils/onboarding/record';
import {focusAxis, radarValues, scoreAxes, type Scores} from '@/utils/onboarding/scoring';
import {addedTemplateIdsOf, pickStarters, toHabitInput, type StarterPick} from '@/utils/onboarding/starters';
import type {Axis, CompleteAnswers} from '@/utils/onboarding/types';

// The routine's reminder: on by default at 20:00 (the app shows 24-hour times). Without the native time picker,
// these fixed choices replace the picker, since onboarding has no free-text input.
export const ROUTINE_REMINDER_DEFAULT = '20:00';
export const ROUTINE_TIME_CHOICES = ['18:00', '20:00', '21:00'] as const;

export type Plan = {
  answers: CompleteAnswers;// Q10 included, in memory only
  scores: Scores;
  radar: number[];
  focus: Axis;
  picks: StarterPick[];
  previous: OnboardingRecord | null;// the record before this run (retake keeps its addedTemplateIds)
};

// Retake: templates added by earlier runs are left out before picking, and a replace habit whose name the user
// already has is left out (Q10 is never stored, so names are the only way to tell)
export function buildPlan(answers: CompleteAnswers, stored: ParsedRecord, existingHabitNames: readonly string[]): Plan {
  const previous = stored.kind === 'ok' ? stored.record : null;
  const scores = scoreAxes(answers);
  return {
    answers,
    scores,
    radar: radarValues(scores),
    focus: focusAxis(scores, answers.focus),
    picks: pickStarters(answers, {excludeIds: previous?.addedTemplateIds ?? [], existingHabitNames}),
    previous,
  };
}

export type CreateDeps = {
  addHabit: (input: HabitInput) => Promise<unknown>;
  saveRecord: (record: OnboardingRecord) => Promise<void>;
  now: () => number;
  onCreated?: (pickId: string) => void;// after each success, before its record save
};

// What this screen has done so far: pick ids created, and the record as last saved (null = nothing saved yet)
export type CreateSession = {created: ReadonlySet<string>; saved: OnboardingRecord | null};

export type CreateResult = CreateSession & {failed: boolean; createdNow: number};

// Creates the selected cards not created yet, one at a time, in card order. Stops at the first failure and
// keeps what was created; calling it again with the returned session retries the rest and never creates a
// card twice.
export async function createPlannedHabits(deps: CreateDeps, input: {
  plan: Plan;
  selected: ReadonlySet<string>;
  reminderTime: string | null;
  session: CreateSession;
}): Promise<CreateResult> {
  const created = new Set(input.session.created);
  let saved = input.session.saved;
  let createdNow = 0;

  for (const pick of input.plan.picks) {
    if (!input.selected.has(pick.id) || created.has(pick.id)) continue;
    try {
      await deps.addHabit(toHabitInput(pick, input.reminderTime));
    } catch {
      return {created, saved, failed: true, createdNow};
    }
    created.add(pick.id);
    createdNow += 1;
    deps.onCreated?.(pick.id);
    saved = withAddedTemplates(saved ?? completedRecord(input.plan.previous, input.plan.answers, deps.now()), addedTemplateIdsOf([pick]));
    await deps.saveRecord(saved);
  }

  if (!saved) {
    // reached only when no card was selected (or none was left to pick): the user chose to create none
    saved = completedRecord(input.plan.previous, input.plan.answers, deps.now());
    await deps.saveRecord(saved);
  }
  return {created, saved, failed: false, createdNow};
}
