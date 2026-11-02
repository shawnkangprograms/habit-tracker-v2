// The onboarding steps and their answer rules (docs/ONBOARDING_SPEC.md, sections 1, 8 and 9). Pure.
// Every change goes through these functions: an invalid value leaves the answers unchanged, so the screens
// can never hold an answer the validators below would reject.

import type {Result} from '@/validation/validators';
import {
  AGE_RANGES, BAD_HABITS, CONFIDENCE_DEFAULT, CONFIDENCE_MAX, CONFIDENCE_MIN, DAYS, DERAILS, FOCUS_AREAS, FOCUS_MAX,
  GENERAL_CHALLENGES, HABITS_FEEL, OCCUPATIONS, SLEEP, STUDENT_CHALLENGES, VALUES, VALUES_MAX, isOneOf,
  type Answers, type Challenge, type CompleteAnswers, type Occupation, type StoredAnswers,
} from '@/utils/onboarding/types';

// One step per question; the progress line reads "STEP n OF 11"
export const STEPS = [
  'age', 'occupation', 'habitsFeel', 'focus', 'challenge', 'derails', 'sleep', 'days', 'values', 'badHabit', 'confidence',
] as const;
export type StepKey = (typeof STEPS)[number];
export const STEP_COUNT = STEPS.length;

export type SingleKey = 'age' | 'occupation' | 'habitsFeel' | 'challenge' | 'derails' | 'sleep' | 'days' | 'badHabit';
export type MultiKey = 'focus' | 'values';
export const MULTI_MAX: Record<MultiKey, number> = {focus: FOCUS_MAX, values: VALUES_MAX};

const ok = <T>(value: T): Result<T> => ({valid: true, value});
const fail = <T>(error: string): Result<T> => ({valid: false, error});

export function emptyAnswers(): Answers {
  return {
    age: null, occupation: null, habitsFeel: null, focus: [], challenge: null, derails: null,
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
    case 'age': return AGE_RANGES;
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

export function setConfidence(answers: Answers, value: number): Answers {
  return isConfidence(value) ? {...answers, confidence: value} : answers;
}

// Continue needs an answer on every step. Q10 is the one step that can be skipped instead (canSkip).
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

export function canSkip(step: StepKey): boolean {
  return step === 'badHabit';
}

// A real array of known values, no duplicates, 1..max long
function validMulti<T extends string>(list: readonly T[], value: unknown, max: number): value is T[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= max
    && value.every((v) => isOneOf(list, v)) && new Set(value).size === value.length;
}

// Every field except Q10, rebuilt from the known fields only (anything else is dropped)
function validateCore(input: unknown): Result<StoredAnswers> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('answers');
  const o = input as Record<string, unknown>;
  if (!isOneOf(AGE_RANGES, o.age)) return fail('age');
  if (!isOneOf(OCCUPATIONS, o.occupation)) return fail('occupation');
  if (!isOneOf(HABITS_FEEL, o.habitsFeel)) return fail('habitsFeel');
  if (!validMulti(FOCUS_AREAS, o.focus, FOCUS_MAX)) return fail('focus');
  if (!isOneOf(challengeOptions(o.occupation), o.challenge)) return fail('challenge');
  if (!isOneOf(DERAILS, o.derails)) return fail('derails');
  if (!isOneOf(SLEEP, o.sleep)) return fail('sleep');
  if (!isOneOf(DAYS, o.days)) return fail('days');
  if (!validMulti(VALUES, o.values, VALUES_MAX)) return fail('values');
  if (!isConfidence(o.confidence)) return fail('confidence');
  return ok({
    age: o.age, occupation: o.occupation, habitsFeel: o.habitsFeel, focus: [...o.focus], challenge: o.challenge,
    derails: o.derails, sleep: o.sleep, days: o.days, values: [...o.values], confidence: o.confidence,
  });
}

// A finished questionnaire, ready for scoring and picking
export function validateAnswers(input: unknown): Result<CompleteAnswers> {
  const core = validateCore(input);
  if (!core.valid) return core;
  const badHabit = (input as Record<string, unknown>).badHabit ?? null;
  if (badHabit !== null && !isOneOf(BAD_HABITS, badHabit)) return fail('badHabit');
  return ok({...core.value, badHabit});
}

// The answers as stored in the local record: Q10 is never part of them, even if the input has it
export function validateStoredAnswers(input: unknown): Result<StoredAnswers> {
  return validateCore(input);
}
