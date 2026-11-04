// Starter habit picking (utils/onboarding/starters.ts), docs/ONBOARDING_SPEC.md section 4: from the two chosen
// packs (docs/PACKS_REPORTS_SPEC.md, sections 1 and 3).
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
const {builtinPack} = await import('../utils/packs/builtin.ts');
const {chooseOnboardingPacks} = await import('../utils/packs/choose.ts');
const {scoreAxes} = await import('../utils/onboarding/scoring.ts');

// Scores only Career (4); every other axis 1, so the packs are Career Builder, then Steady Energy (the tie order
// starts with Health). Confidence 5: 3 habits.
const BASE: CompleteAnswers = {
  timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
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
  test('the two packs\' templates in turn: the focus pack first, then the second pack, in card order', () => {
    assert.deepEqual(ids(st.pickStarters(BASE)), ['focus25', 'walk20', 'skill15']);
    // Health 3 (picked first in Q4), Mind 3: Steady Energy, then Calm Mind; 4 habits
    const a: CompleteAnswers = {...BASE, focus: ['health', 'mental'], confidence: 8};
    assert.deepEqual(ids(st.pickStarters(a)), ['walk20', 'breathe5', 'stretch10', 'journal3']);
  });

  test('a first run picks only from its two packs (or the forced sleep pick)', () => {
    for (const area of t.FOCUS_AREAS) {
      for (const sleep of t.SLEEP) {
        for (const timeBudget of t.TIME_BUDGETS) {
          const a: CompleteAnswers = {...BASE, focus: [area], sleep, timeBudget, confidence: 10};
          const pool = chooseOnboardingPacks(scoreAxes(a), a.focus).flatMap((id) => builtinPack(id).templates as readonly string[]);
          for (const p of st.pickStarters(a).filter((pick) => pick.kind === 'catalog')) {
            assert.ok(pool.includes(p.id) || st.SLEEP_TEMPLATE_IDS.includes(p.id as never), `${p.id} ${JSON.stringify(a)}`);
          }
        }
      }
    }
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
    assert.equal(st.CATALOG.length, 24);
    for (const c of st.CATALOG) assert.ok((ICON_IDS as readonly string[]).includes(c.icon), c.id);
  });
});

describe('sleep force-pick', () => {
  const struggling: CompleteAnswers = {...BASE, focus: ['health', 'mental'], confidence: 8, sleep: 'struggle'};

  test('struggle or irregular puts a sleep template in the last slot', () => {
    assert.deepEqual(ids(st.pickStarters(struggling)), ['walk20', 'breathe5', 'stretch10', 'lights_out']);
    assert.deepEqual(ids(st.pickStarters({...struggling, sleep: 'irregular'})), ['walk20', 'breathe5', 'stretch10', 'lights_out']);
  });

  test('Calm Mind not chosen: the sleep pick still comes from it (an "other habit" on the routine)', () => {
    assert.deepEqual(ids(st.pickStarters({...BASE, sleep: 'struggle'})), ['focus25', 'walk20', 'lights_out']);
  });

  test('good or okay sleep forces nothing', () => {
    for (const sleep of ['good', 'okay'] as const) {
      assert.equal(ids(st.pickStarters({...struggling, sleep})).some((id) => st.SLEEP_TEMPLATE_IDS.includes(id as never)), false);
    }
  });

  test('a sleep template picked anyway is kept, and nothing is replaced', () => {
    const picks = ids(st.pickStarters({...struggling, confidence: 5}, {excludeIds: ['walk20', 'stretch10', 'water_meals']}));
    assert.deepEqual(picks, ['breathe5', 'journal3', 'lights_out']);
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
    assert.deepEqual(ids(st.pickStarters(BASE, {excludeIds: ['focus25']})), ['walk20', 'skill15', 'stretch10']);
  });

  test('both packs used up: the rest of the catalog fills in by area rank', () => {
    const excludeIds = ['focus25', 'skill15', 'work_win', 'reach_out', 'walk20', 'stretch10'];
    // water_meals and eat_produce are all the packs have left; Career is used up, so Discipline (next in rank) fills
    assert.deepEqual(ids(st.pickStarters(BASE, {excludeIds})), ['water_meals', 'eat_produce', 'plan_top1']);
  });

  test('a template that only did not fit the budget never brings in the rest of the catalog', () => {
    // Study Sprint has one habit of 5 minutes or less (teach_back), so "About 5 minutes" gets 3 picks of 4
    const student: CompleteAnswers = {...BASE, occupation: 'student', focus: ['education'], timeBudget: 'min5', confidence: 10};
    assert.deepEqual(chooseOnboardingPacks(scoreAxes(student), student.focus), ['study_sprint', 'steady_energy']);
    assert.deepEqual(ids(st.pickStarters(student)), ['water_meals', 'teach_back', 'eat_produce']);
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
    assert.deepEqual(st.addedTemplateIdsOf(picks), ['focus25', 'walk20', 'skill15']);
  });
});

describe('toHabitInput', () => {
  test('daily, the chosen reminder time (or none), no alarm, no heads-up', () => {
    const pick = st.pickStarters(BASE)[0];
    assert.deepEqual(st.toHabitInput(pick, '20:00'), {
      habitName: 'One 25-minute focus block', icon: 'work', frequency: {type: 'daily'}, reminderTime: '20:00',
      alarm: false, remindBeforeMin: 0,
    });
    assert.equal(st.toHabitInput(pick, null).reminderTime, null);
  });
});

describe('time budget (Q1)', () => {
  const minutesOf = (id: string) => st.CATALOG.find((tpl) => tpl.id === id)!.minutes;

  test('the caps: single = the budget, total = twice the budget; an hour or more has none', () => {
    assert.deepEqual(st.BUDGET_CAPS, {
      min5: {single: 5, total: 10}, min15: {single: 15, total: 30}, min30: {single: 30, total: 60},
      min60: {single: Infinity, total: Infinity},
    });
  });

  test('every template and replace habit has whole minutes, at least 1', () => {
    for (const tpl of st.CATALOG) assert.ok(Number.isInteger(tpl.minutes) && tpl.minutes >= 1, tpl.id);
    assert.deepEqual(Object.keys(st.REPLACE_MINUTES), [...t.REPLACE_ANSWERS]);
    for (const m of Object.values(st.REPLACE_MINUTES)) assert.ok(Number.isInteger(m) && m >= 1);
  });

  test('across a sweep of answers, no catalog pick breaks either cap, and the count never grows', () => {
    for (const timeBudget of t.TIME_BUDGETS) {
      const caps = st.BUDGET_CAPS[timeBudget];
      for (const area of t.FOCUS_AREAS) {
        for (const sleep of t.SLEEP) {
          for (const confidence of [1, 5, 10]) {
            const a: CompleteAnswers = {...BASE, timeBudget, focus: [area], sleep, confidence};
            const catalog = st.pickStarters(a).filter((p) => p.kind === 'catalog');
            const label = JSON.stringify({timeBudget, area, sleep, confidence});
            for (const p of catalog) assert.ok(minutesOf(p.id) <= caps.single, `${p.id} ${label}`);
            assert.ok(catalog.reduce((sum, p) => sum + minutesOf(p.id), 0) <= caps.total, label);
            assert.ok(catalog.length <= st.baseStarterCount(confidence), label);
          }
        }
      }
    }
  });

  test('a pick that does not fit is skipped and picking continues down the list', () => {
    // focus25 (25), walk20 (20) and skill15 (15) are too long for min5; the shorter ones further down fill in
    assert.deepEqual(ids(st.pickStarters({...BASE, timeBudget: 'min5'})), ['work_win', 'water_meals', 'reach_out']);
    assert.deepEqual(ids(st.pickStarters({...BASE, timeBudget: 'min15'})), ['skill15', 'stretch10', 'work_win']);
  });

  test('a sleep struggle still gets a sleep template on the smallest budget', () => {
    for (const sleep of ['struggle', 'irregular'] as const) {
      const picks = ids(st.pickStarters({...BASE, timeBudget: 'min5', sleep, confidence: 10}));
      assert.ok(picks.some((id) => (st.SLEEP_TEMPLATE_IDS as readonly string[]).includes(id)), sleep);
    }
  });

  test('the Q10 replace pick is exempt from the caps', () => {
    const picks = st.pickStarters({...BASE, timeBudget: 'min5', badHabit: 'junk_food'});
    assert.ok(picks.some((p) => p.kind === 'replace' && p.habitName === REPLACE_NAMES.junk_food));// 30 minutes
  });

  test('the time budget never changes the scores', async () => {
    const {scoreAxes} = await import('../utils/onboarding/scoring.ts');
    const answers = (timeBudget: CompleteAnswers['timeBudget']): CompleteAnswers => ({...BASE, timeBudget});
    const first = scoreAxes(answers('min5'));
    for (const timeBudget of t.TIME_BUDGETS) assert.deepEqual(scoreAxes(answers(timeBudget)), first, timeBudget);
  });
});
