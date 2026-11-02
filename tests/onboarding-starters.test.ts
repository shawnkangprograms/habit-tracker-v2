// Starter habit picking (utils/onboarding/starters.ts), docs/ONBOARDING_SPEC.md section 4.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {CompleteAnswers} from '../utils/onboarding/types.ts';
import type {StarterPick} from '../utils/onboarding/starters.ts';

const st = await import('../utils/onboarding/starters.ts');
const t = await import('../utils/onboarding/types.ts');
const {REPLACE_NAMES} = await import('../utils/onboarding/copy.ts');
const {validateHabitInput} = await import('../validation/validators.ts');
const {ICON_IDS} = await import('../constants/habits.ts');

// Scores only Career (4); every other axis 1. Confidence 5: 3 habits.
const BASE: CompleteAnswers = {
  age: '25_34', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
  derails: 'boredom', sleep: 'good', days: 'predictable', values: ['freedom'], badHabit: null, confidence: 5,
};

const ids = (picks: StarterPick[]) => picks.map((p) => p.id);

describe('how many', () => {
  test('confidence 1-3 gives 2, 4-7 gives 3, 8-10 gives 4', () => {
    const expected: [number, number][] = [[1, 2], [3, 2], [4, 3], [7, 3], [8, 4], [10, 4]];
    for (const [confidence, count] of expected) {
      assert.equal(st.baseStarterCount(confidence), count, String(confidence));
      assert.equal(st.pickStarters({...BASE, confidence}).length, count, String(confidence));
    }
  });

  test('an answered Q10 adds one, up to 5; "other" and skipped add none', () => {
    assert.equal(st.starterCount({confidence: 5, badHabit: null}), 3);
    assert.equal(st.starterCount({confidence: 5, badHabit: 'other'}), 3);
    assert.equal(st.starterCount({confidence: 5, badHabit: 'gaming'}), 4);
    assert.equal(st.starterCount({confidence: 10, badHabit: 'porn'}), 5);
    assert.equal(st.pickStarters({...BASE, confidence: 10, badHabit: 'porn'}).length, 5);
    assert.equal(st.pickStarters({...BASE, badHabit: 'other'}).some((p) => p.kind === 'replace'), false);
  });
});

describe('pick order', () => {
  test('one per axis above 1, highest first, then the focus axis', () => {
    // Health 3 (picked first in Q4), Mind 3, Career 2; 4 habits
    const a: CompleteAnswers = {...BASE, focus: ['health', 'mental'], confidence: 8};
    assert.deepEqual(ids(st.pickStarters(a)), ['walk20', 'breathe5', 'skill15', 'stretch10']);
  });

  test('when the focus axis runs out, the next axes in rank order fill the rest', () => {
    // Career has one template; the rest are 1, so the fixed order decides: Discipline next
    assert.deepEqual(ids(st.pickStarters(BASE)), ['skill15', 'plan_top1', 'focus25']);
  });

  test('never two templates with the same id, across a sweep of answers', () => {
    for (const area of t.FOCUS_AREAS) {
      for (const sleep of t.SLEEP) {
        for (let confidence = 1; confidence <= 10; confidence++) {
          for (const badHabit of [null, ...t.BAD_HABITS]) {
            const a: CompleteAnswers = {...BASE, focus: [area], sleep, confidence, badHabit};
            const picks = st.pickStarters(a);
            const label = JSON.stringify({area, sleep, confidence, badHabit});
            assert.equal(new Set(ids(picks)).size, picks.length, label);
            assert.equal(picks.length, st.starterCount(a), label);
            for (const p of picks) {
              assert.equal(validateHabitInput(st.toHabitInput(p, '20:00')).valid, true, `${label} ${p.habitName}`);
              assert.ok(p.reason.length > 0 && Array.from(p.reason).length <= 60, `${label} ${p.id}`);
            }
          }
        }
      }
    }
  });

  test('catalog ids are the spec ids, with icons from the existing set', () => {
    assert.deepEqual(st.CATALOG.map((c) => c.id), [...t.TEMPLATE_IDS]);
    for (const c of st.CATALOG) assert.ok((ICON_IDS as readonly string[]).includes(c.icon), c.id);
  });
});

describe('sleep force-pick', () => {
  const struggling: CompleteAnswers = {...BASE, focus: ['health', 'mental'], confidence: 8, sleep: 'struggle'};

  test('struggle or irregular puts a sleep template in the last slot', () => {
    assert.deepEqual(ids(st.pickStarters(struggling)), ['walk20', 'breathe5', 'skill15', 'lights_out']);
    assert.deepEqual(ids(st.pickStarters({...struggling, sleep: 'irregular'})), ['walk20', 'breathe5', 'skill15', 'lights_out']);
  });

  test('good or okay sleep forces nothing', () => {
    for (const sleep of ['good', 'okay'] as const) {
      assert.equal(ids(st.pickStarters({...struggling, sleep})).some((id) => st.SLEEP_TEMPLATE_IDS.includes(id as never)), false);
    }
  });

  test('a sleep template picked anyway is kept, and nothing is replaced', () => {
    const picks = ids(st.pickStarters({...struggling, confidence: 5}, {excludeIds: ['walk20', 'stretch10', 'water_meals']}));
    assert.deepEqual(picks, ['lights_out', 'breathe5', 'skill15']);
  });

  test('retake: screens_off when lights_out was added before; nothing when both were', () => {
    assert.ok(ids(st.pickStarters(struggling, {excludeIds: ['lights_out']})).includes('screens_off'));
    const neither = ids(st.pickStarters(struggling, {excludeIds: ['lights_out', 'screens_off']}));
    assert.equal(neither.some((id) => id === 'lights_out' || id === 'screens_off'), false);
    assert.equal(neither.length, 4);
  });
});

describe('Q10 replace habit', () => {
  test('each answer adds its generic name last; the id never carries the answer', () => {
    for (const answer of t.REPLACE_ANSWERS) {
      const picks = st.pickStarters({...BASE, badHabit: answer});
      const last = picks[picks.length - 1];
      assert.equal(last.kind, 'replace', answer);
      assert.equal(last.id, st.REPLACE_PICK_ID);
      assert.equal(last.habitName, REPLACE_NAMES[answer]);
      assert.equal(validateHabitInput(st.toHabitInput(last, null)).valid, true, answer);
    }
  });

  test('the sensitive answers get neutral names and icons', () => {
    assert.deepEqual(
      t.SENSITIVE_BAD_HABITS.map((answer) => st.pickStarters({...BASE, badHabit: answer}).at(-1)?.habitName),
      ['Phone out of the bedroom', 'Fresh-air morning', 'Clear-headed evening'],
    );
    for (const answer of t.SENSITIVE_BAD_HABITS) {
      const pick = st.pickStarters({...BASE, badHabit: answer}).at(-1)!;
      assert.doesNotMatch(`${pick.habitName} ${pick.icon}`, /porn|sex|smok|vap|cigar|nicotine|alcohol|drink|beer|wine/i, answer);
    }
  });

  test('no pick id contains any Q10 value', () => {
    for (const answer of t.BAD_HABITS) {
      for (const p of st.pickStarters({...BASE, confidence: 10, badHabit: answer})) {
        assert.ok([...t.TEMPLATE_IDS, st.REPLACE_PICK_ID].includes(p.id as never), p.id);
        for (const value of t.BAD_HABITS) assert.equal(p.id.includes(value), false, `${p.id} has ${value}`);
      }
    }
  });
});

describe('retake dedupe', () => {
  test('templates added before are left out before picking, so the count holds', () => {
    assert.deepEqual(ids(st.pickStarters(BASE, {excludeIds: ['skill15']})), ['plan_top1', 'focus25', 'walk20']);
  });

  test('when every template was added, only a replace habit can be left', () => {
    assert.deepEqual(st.pickStarters(BASE, {excludeIds: t.TEMPLATE_IDS}), []);
    assert.deepEqual(ids(st.pickStarters({...BASE, badHabit: 'gaming'}, {excludeIds: t.TEMPLATE_IDS})), ['replace']);
  });

  test('a replace habit is left out when the user already has a habit with that name (any case or spacing)', () => {
    const picks = st.pickStarters({...BASE, badHabit: 'phone_social'}, {existingHabitNames: ['  phone-free FIRST hour ']});
    assert.equal(picks.some((p) => p.kind === 'replace'), false);
    assert.equal(picks.length, 3);
  });

  test('only catalog ids go into addedTemplateIds', () => {
    const picks = st.pickStarters({...BASE, badHabit: 'alcohol'});
    assert.deepEqual(st.addedTemplateIdsOf(picks), ['skill15', 'plan_top1', 'focus25']);
  });
});

describe('toHabitInput', () => {
  test('daily, the chosen reminder time (or none), no alarm, no heads-up', () => {
    const pick = st.pickStarters(BASE)[0];
    assert.deepEqual(st.toHabitInput(pick, '20:00'), {
      habitName: 'Practise a skill 15 minutes', icon: 'work', frequency: {type: 'daily'}, reminderTime: '20:00',
      alarm: false, remindBeforeMin: 0,
    });
    assert.equal(st.toHabitInput(pick, null).reminderTime, null);
  });
});
