// Onboarding steps and answer rules (utils/onboarding/flow.ts). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Answers, CompleteAnswers} from '../utils/onboarding/types.ts';
import type {SingleKey} from '../utils/onboarding/flow.ts';

const f = await import('../utils/onboarding/flow.ts');
const t = await import('../utils/onboarding/types.ts');

const COMPLETE: CompleteAnswers = {
  age: '25_34', occupation: 'early_career', habitsFeel: 'alright', focus: ['health', 'career'], challenge: 'time',
  derails: 'stress', sleep: 'okay', days: 'mostly', values: ['achievement'], badHabit: null, confidence: 6,
};

const SINGLE_ENUMS: [SingleKey, readonly string[]][] = [
  ['age', t.AGE_RANGES], ['occupation', t.OCCUPATIONS], ['habitsFeel', t.HABITS_FEEL], ['derails', t.DERAILS],
  ['sleep', t.SLEEP], ['days', t.DAYS], ['badHabit', t.BAD_HABITS],
];

const withOccupation = (occupation: Answers['occupation']): Answers => ({...f.emptyAnswers(), occupation});

describe('steps', () => {
  test('11 fixed steps, Q10 is the only skippable one, confidence starts at 5', () => {
    assert.equal(f.STEP_COUNT, 11);
    assert.deepEqual(f.STEPS.filter(f.canSkip), ['badHabit']);
    assert.equal(f.emptyAnswers().confidence, 5);
  });

  test('Continue needs an answer on every step except the slider, which has its default', () => {
    const empty = f.emptyAnswers();
    for (const step of f.STEPS) assert.equal(f.canContinue(empty, step), step === 'confidence', step);
    const done: Answers = {...COMPLETE, badHabit: 'gaming'};
    for (const step of f.STEPS) assert.equal(f.canContinue(done, step), true, step);
  });
});

describe('single answers', () => {
  test('every enum value is accepted on its step', () => {
    for (const [key, values] of SINGLE_ENUMS) {
      for (const value of values) assert.equal(f.selectSingle(f.emptyAnswers(), key, value)[key], value, `${key} ${value}`);
    }
  });

  test('unknown, wrongly cased or non-string values change nothing', () => {
    for (const [key] of SINGLE_ENUMS) {
      const before = f.emptyAnswers();
      for (const bad of ['nope', 'Student', '', '__proto__', 42, undefined]) {
        assert.equal(f.selectSingle(before, key, bad as string), before, `${key} ${String(bad)}`);
      }
    }
  });

  test('only Q10 can be cleared ("Skip this one")', () => {
    const answered = {...f.emptyAnswers(), age: '18_24' as const, badHabit: 'gaming' as const};
    assert.equal(f.selectSingle(answered, 'badHabit', null).badHabit, null);
    assert.equal(f.selectSingle(answered, 'age', null), answered);
  });

  test('Q5 takes only values from the list Q2 chose', () => {
    for (const value of t.STUDENT_CHALLENGES) {
      assert.equal(f.selectSingle(withOccupation('student'), 'challenge', value).challenge, value);
    }
    for (const value of t.GENERAL_CHALLENGES) {
      assert.equal(f.selectSingle(withOccupation('mid_career'), 'challenge', value).challenge, value);
    }
    assert.equal(f.selectSingle(withOccupation('student'), 'challenge', 'time').challenge, null);
    assert.equal(f.selectSingle(withOccupation('mid_career'), 'challenge', 'memory').challenge, null);
    assert.deepEqual(f.challengeOptions(null), t.GENERAL_CHALLENGES);
  });
});

describe('Q2 change clears Q5 only when the list changes', () => {
  const answered = (occupation: Answers['occupation'], challenge: Answers['challenge']): Answers =>
    ({...f.emptyAnswers(), occupation, challenge});

  test('student to any other answer, and back, clears it (even procrastination, which is in both lists)', () => {
    assert.equal(f.selectSingle(answered('student', 'memory'), 'occupation', 'early_career').challenge, null);
    assert.equal(f.selectSingle(answered('student', 'procrastination'), 'occupation', 'mid_career').challenge, null);
    assert.equal(f.selectSingle(answered('self_employed', 'time'), 'occupation', 'student').challenge, null);
  });

  test('a change within the same group keeps it', () => {
    assert.equal(f.selectSingle(answered('early_career', 'balance'), 'occupation', 'between_jobs').challenge, 'balance');
    assert.equal(f.selectSingle(answered('student', 'memory'), 'occupation', 'student').challenge, 'memory');
  });
});

describe('multi answers', () => {
  test('Q4 keeps pick order; a removed pick comes back at the end; a 4th pick does nothing', () => {
    let a = f.emptyAnswers();
    for (const area of ['career', 'health', 'mental']) a = f.toggleMulti(a, 'focus', area);
    assert.deepEqual(a.focus, ['career', 'health', 'mental']);
    assert.equal(f.isAtMax(a, 'focus'), true);
    assert.equal(f.toggleMulti(a, 'focus', 'education'), a);
    a = f.toggleMulti(f.toggleMulti(a, 'focus', 'career'), 'focus', 'career');
    assert.deepEqual(a.focus, ['health', 'mental', 'career']);
  });

  test('Q9 allows 2; unknown values change nothing', () => {
    let a = f.toggleMulti(f.toggleMulti(f.emptyAnswers(), 'values', 'freedom'), 'values', 'connection');
    assert.equal(f.isAtMax(a, 'values'), true);
    assert.equal(f.toggleMulti(a, 'values', 'achievement'), a);
    a = f.emptyAnswers();
    assert.equal(f.toggleMulti(a, 'values', 'health'), a);
    assert.equal(f.toggleMulti(a, 'focus', 'health_energy'), a);
  });

  test('every focus area and value is accepted', () => {
    for (const area of t.FOCUS_AREAS) assert.deepEqual(f.toggleMulti(f.emptyAnswers(), 'focus', area).focus, [area]);
    for (const value of t.VALUES) assert.deepEqual(f.toggleMulti(f.emptyAnswers(), 'values', value).values, [value]);
  });
});

describe('confidence', () => {
  test('integers 1 to 10 only', () => {
    for (let n = 1; n <= 10; n++) assert.equal(f.setConfidence(f.emptyAnswers(), n).confidence, n);
    const a = f.emptyAnswers();
    for (const bad of [0, 11, 5.5, Number.NaN, -1]) assert.equal(f.setConfidence(a, bad), a, String(bad));
  });
});

describe('validateAnswers', () => {
  test('a finished questionnaire passes, as a copy with only the known fields', () => {
    const result = f.validateAnswers({...COMPLETE, extra: 'x'});
    assert.ok(result.valid);
    assert.deepEqual(result.value, COMPLETE);
    assert.notEqual(result.value.focus, COMPLETE.focus);
  });

  test('every enum value of every question validates', () => {
    const lists: [keyof CompleteAnswers, readonly string[]][] = [
      ['age', t.AGE_RANGES], ['occupation', t.OCCUPATIONS.filter((o) => o !== 'student')], ['habitsFeel', t.HABITS_FEEL],
      ['derails', t.DERAILS], ['sleep', t.SLEEP], ['days', t.DAYS], ['badHabit', t.BAD_HABITS],
    ];
    for (const [key, values] of lists) {
      for (const value of values) assert.ok(f.validateAnswers({...COMPLETE, [key]: value}).valid, `${key} ${value}`);
    }
    for (const value of t.GENERAL_CHALLENGES) assert.ok(f.validateAnswers({...COMPLETE, challenge: value}).valid, value);
    for (const value of t.STUDENT_CHALLENGES) {
      assert.ok(f.validateAnswers({...COMPLETE, occupation: 'student', challenge: value}).valid, value);
    }
    for (const area of t.FOCUS_AREAS) assert.ok(f.validateAnswers({...COMPLETE, focus: [area]}).valid, area);
    for (const value of t.VALUES) assert.ok(f.validateAnswers({...COMPLETE, values: [value]}).valid, value);
  });

  test('Q10 skipped or missing is null', () => {
    const {badHabit: _skip, ...noQ10} = COMPLETE;
    const result = f.validateAnswers(noQ10);
    assert.ok(result.valid);
    assert.equal(result.value.badHabit, null);
  });

  test('anything off is rejected, never coerced', () => {
    const cases: [string, unknown][] = [
      ['answers', null], ['answers', []], ['answers', 'x'],
      ['age', {...COMPLETE, age: '12_17'}], ['occupation', {...COMPLETE, occupation: 'Student'}],
      ['habitsFeel', {...COMPLETE, habitsFeel: undefined}],
      ['focus', {...COMPLETE, focus: []}], ['focus', {...COMPLETE, focus: ['health', 'mental', 'career', 'education']}],
      ['focus', {...COMPLETE, focus: ['health', 'health']}], ['focus', {...COMPLETE, focus: 'health'}],
      ['challenge', {...COMPLETE, challenge: 'memory'}], ['challenge', {...COMPLETE, occupation: 'student', challenge: 'time'}],
      ['derails', {...COMPLETE, derails: 'stress '}], ['sleep', {...COMPLETE, sleep: 1}], ['days', {...COMPLETE, days: null}],
      ['values', {...COMPLETE, values: ['freedom', 'connection', 'achievement']}], ['values', {...COMPLETE, values: ['health']}],
      ['confidence', {...COMPLETE, confidence: 0}], ['confidence', {...COMPLETE, confidence: '5'}],
      ['confidence', {...COMPLETE, confidence: 7.5}], ['badHabit', {...COMPLETE, badHabit: 'vaping'}],
    ];
    for (const [field, input] of cases) {
      const result = f.validateAnswers(input);
      assert.equal(result.valid, false, `${field}: ${JSON.stringify(input)}`);
      if (!result.valid) assert.equal(result.error, field);
    }
  });

  test('stored answers never include Q10, even when the input has it', () => {
    const result = f.validateStoredAnswers({...COMPLETE, badHabit: 'alcohol'});
    assert.ok(result.valid);
    assert.equal('badHabit' in result.value, false);
  });
});
