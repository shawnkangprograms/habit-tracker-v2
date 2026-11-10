// The onboarding steps and their answer rules (docs/ONBOARDING_SPEC.md, sections 1, 8 and 9). Pure.
// Every change goes through these functions: an invalid value leaves the answers unchanged, so the screens
// can never hold an answer the validators below would reject.

import type {Result} from '@/validation/validators';
import {
  BAD_HABITS, CONFIDENCE_DEFAULT, CONFIDENCE_MAX, CONFIDENCE_MIN, DAYS, DERAILS, FOCUS_AREAS, FOCUS_MAX,
  GENERAL_CHALLENGES, HABITS_FEEL, OCCUPATIONS, SLEEP, STUDENT_CHALLENGES, TIME_BUDGETS, VALUES, VALUES_MAX, isOneOf,
  type Answers, type Challenge, type CompleteAnswers, type Occupation,
} from '@/utils/onboarding/types';

// One step per question; the progress line reads "STEP n OF 11"
export const STEPS = [
  'timeBudget', 'occupation', 'habitsFeel', 'focus', 'challenge', 'derails', 'sleep', 'days', 'values', 'badHabit', 'confidence',
] as const;
export type StepKey = (typeof STEPS)[number];
export const STEP_COUNT = STEPS.length;

export type SingleKey = 'timeBudget' |'occupation' | 'habitsFeel' | 'challenge' | 'derails' | 'sleep' | 'days' | 'badHabit';
export type MultiKey = 'focus' | 'values';
export const MULTI_MAX: Record<MultiKey, number> = {focus: FOCUS_MAX, values: VALUES_MAX};

const ok = <T>(value: T): Result<T> => ({valid: true, value});
const fail = <T>(error: string): Result<T> => ({valid: false, error});

export function emptyAnswers(): Answers {
  return {
    timeBudget: null, occupation: null, habitsFeel: null, focus: [], challenge: null, derails: null,
    sleep: null, days: null, values: [], badHabit: null, confidence: CONFIDENCE_DEFAULT,
  };
}

const isStudent = (occupation: Occupation | null) => occupation === 'student';

// Q5's list depends on Q2 (no answer yet shows the general list)
export function challengeOptions(occupation: Occupation | null): readonly Challenge[] {
  return isStudent(occupation) ? STUDENT_CHALLENGES : GENERAL_CHALLENGES;
}

export function singleOptions(key: SingleKey, answers: Answers): readonly string[] {
  switch (key) {
    case 'timeBudget': return TIME_BUDGETS;
    case 'occupation': return OCCUPATIONS;
    case 'habitsFeel': return HABITS_FEEL;
    case 'challenge': return challengeOptions(answers.occupation);
    case 'derails': return DERAILS;
    case 'sleep': return SLEEP;
    case 'days': return DAYS;
    case 'badHabit': return BAD_HABITS;
  }
}

export function multiOptions(key: MultiKey): readonly string[] {
  return key === 'focus' ? FOCUS_AREAS : VALUES;
}

// Picks one option. Only Q10 takes null ("Skip this one"). Changing Q2 between student and any other answer
// clears Q5, because its list changed; a change within the same group keeps it.
export function selectSingle(answers: Answers, key: SingleKey, value: string | null): Answers {
  if (value === null) return key === 'badHabit' ? {...answers, badHabit: null} : answers;
  if (!singleOptions(key, answers).includes(value)) return answers;
  if (key === 'occupation') {
    const occupation = value as Occupation;
    const listChanged = isStudent(answers.occupation) !== isStudent(occupation);
    return {...answers, occupation, challenge: listChanged ? null : answers.challenge};
  }
  return {...answers, [key]: value};
}

// Tapping a picked option removes it; a new pick goes to the end. At the limit a new pick does nothing.
export function toggleMulti(answers: Answers, key: MultiKey, value: string): Answers {
  if (!multiOptions(key).includes(value)) return answers;
  const current = answers[key] as string[];
  if (current.includes(value)) return {...answers, [key]: current.filter((v) => v !== value)};
  if (current.length >= MULTI_MAX[key]) return answers;
  return {...answers, [key]: [...current, value]};
}

// The unpicked options dim at the limit
export function isAtMax(answers: Answers, key: MultiKey): boolean {
  return answers[key].length >= MULTI_MAX[key];
}

const isConfidence = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= CONFIDENCE_MIN && n <= CONFIDENCE_MAX;

// Also how a touch on the slider answers Q11 again after it was skipped
export function setConfidence(answers: Answers, value: number): Answers {
  return isConfidence(value) ? {...answers, confidence: value} : answers;
}

// Continue needs an answer on every step. The Q11 slider starts at its default, so Continue works there until the
// step is skipped (then it needs a touch on the slider).
export function canContinue(answers: Answers, step: StepKey): boolean {
  switch (step) {
    case 'focus':
    case 'values':
      return answers[step].length > 0;
    case 'challenge':
      return answers.challenge !== null && challengeOptions(answers.occupation).includes(answers.challenge);
    case 'confidence':
      return isConfidence(answers.confidence);
    default:
      return answers[step] !== null;
  }
}

// "Skip this question" is on every step (docs/ONBOARDING_SPEC.md, section 1)
export function canSkip(_step: StepKey): boolean {
  return true;
}

// "Skip this question": that step's answer is removed (null, [] for the multi questions, null for the slider), so
// it contributes nothing to the plan and Back shows it empty. Skipping Q2 leaves Q5 alone: with no occupation Q5
// shows the general list, and an answer from it stays valid.
export function skipStep(answers: Answers, step: StepKey): Answers {
  switch (step) {
    case 'focus':
    case 'values':
      return {...answers, [step]: []};
    case 'occupation':
      return {...answers, occupation: null, challenge: isStudent(answers.occupation) ? null : answers.challenge};
    default:
      return {...answers, [step]: null};
  }
}

// A real array of known values, no duplicates, 1..max long
function validMulti<T extends string>(list: readonly T[], value: unknown, max: number): value is T[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= max
    && value.every((v) => isOneOf(list, v)) && new Set(value).size === value.length;
}

// A skipped single answer is null or missing; anything else must be one of the list
function optional<T extends string>(list: readonly T[], value: unknown): {ok: true; value: T | null} | {ok: false} {
  if (value === null || value === undefined) return {ok: true, value: null};
  return isOneOf(list, value) ? {ok: true, value} : {ok: false};
}

// A skipped multi answer is [] or missing; anything else must be a valid pick list
function optionalMulti<T extends string>(list: readonly T[], value: unknown, max: number): {ok: true; value: T[]} | {ok: false} {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return {ok: true, value: []};
  return validMulti(list, value, max) ? {ok: true, value: [...value]} : {ok: false};
}

// A finished questionnaire, ready for scoring and picking, rebuilt from the known fields only (anything else is
// dropped). Every step is answered or skipped (null, or [] for the multi questions); a value that is present must be
// valid, never coerced. The answers are held in memory only: the local record never stores them (record.ts).
export function validateAnswers(input: unknown): Result<CompleteAnswers> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('answers');
  const o = input as Record<string, unknown>;
  const timeBudget = optional(TIME_BUDGETS, o.timeBudget);
  if (!timeBudget.ok) return fail('timeBudget');
  const occupation = optional(OCCUPATIONS, o.occupation);
  if (!occupation.ok) return fail('occupation');
  const habitsFeel = optional(HABITS_FEEL, o.habitsFeel);
  if (!habitsFeel.ok) return fail('habitsFeel');
  const focus = optionalMulti(FOCUS_AREAS, o.focus, FOCUS_MAX);
  if (!focus.ok) return fail('focus');
  const challenge = optional(challengeOptions(occupation.value), o.challenge);
  if (!challenge.ok) return fail('challenge');
  const derails = optional(DERAILS, o.derails);
  if (!derails.ok) return fail('derails');
  const sleep = optional(SLEEP, o.sleep);
  if (!sleep.ok) return fail('sleep');
  const days = optional(DAYS, o.days);
  if (!days.ok) return fail('days');
  const values = optionalMulti(VALUES, o.values, VALUES_MAX);
  if (!values.ok) return fail('values');
  const confidence = o.confidence ?? null;
  if (confidence !== null && !isConfidence(confidence)) return fail('confidence');
  const badHabit = optional(BAD_HABITS, o.badHabit);
  if (!badHabit.ok) return fail('badHabit');
  return ok({
    timeBudget: timeBudget.value, occupation: occupation.value, habitsFeel: habitsFeel.value, focus: focus.value,
    challenge: challenge.value, derails: derails.value, sleep: sleep.value, days: days.value, values: values.value,
    badHabit: badHabit.value, confidence,
  });
}
