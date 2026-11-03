// The plan after Q11 and the routine's habit creation (utils/onboarding/plan.ts), with the add-habit call and the
// record save injected; the radar geometry (utils/onboarding/radar.ts). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {HabitInput} from '../validation/validators.ts';
import type {CompleteAnswers} from '../utils/onboarding/types.ts';
import type {OnboardingRecord} from '../utils/onboarding/record.ts';
import type {CreateSession, Plan} from '../utils/onboarding/plan.ts';

const p = await import('../utils/onboarding/plan.ts');
const r = await import('../utils/onboarding/record.ts');
const g = await import('../utils/onboarding/gate.ts');
const st = await import('../utils/onboarding/starters.ts');
const radar = await import('../utils/onboarding/radar.ts');
const {validateHabitInput} = await import('../validation/validators.ts');

// Picks: skill15, plan_top1, focus25, plus the replace habit for Q10
const ANSWERS: CompleteAnswers = {
  age: '25_34', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
  derails: 'boredom', sleep: 'good', days: 'predictable', values: ['freedom'], badHabit: 'alcohol', confidence: 5,
};
const NOW = 1_762_000_000_000;
const EMPTY: CreateSession = {created: new Set(), saved: null};

type Event = {type: 'add'; name: string; reminderTime: string | null} | {type: 'save'; record: OnboardingRecord};

// Records every add and save in order; addHabit fails for the names in `failOn`
function harness(failOn: string[] = []) {
  const events: Event[] = [];
  const fail = new Set(failOn);
  return {
    events,
    adds: () => events.flatMap((e) => (e.type === 'add' ? [e.name] : [])),
    saves: () => events.flatMap((e) => (e.type === 'save' ? [e.record] : [])),
    deps: {
      addHabit: async (input: HabitInput) => {
        assert.equal(validateHabitInput(input).valid, true, input.habitName);
        if (fail.has(input.habitName)) throw new Error('disk full');
        events.push({type: 'add', name: input.habitName, reminderTime: input.reminderTime});
      },
      saveRecord: async (record: OnboardingRecord) => {
        events.push({type: 'save', record});
      },
      now: () => NOW,
    },
  };
}

const plan = (over: Partial<Parameters<typeof p.buildPlan>[0]> = {}, stored = {kind: 'none'} as const, names: string[] = []) =>
  p.buildPlan({...ANSWERS, ...over}, stored, names);
const allIds = (pl: Plan) => new Set(pl.picks.map((pick) => pick.id));

describe('buildPlan', () => {
  test('first run: the starters for the answers, scores, radar and focus axis; no earlier record', () => {
    const pl = plan();
    assert.deepEqual(pl.picks, st.pickStarters(ANSWERS));
    assert.deepEqual(pl.picks.map((pick) => pick.id), ['skill15', 'plan_top1', 'focus25', 'replace']);
    assert.equal(pl.focus, 'Career');
    assert.equal(pl.radar.length, 6);
    assert.equal(pl.previous, null);
  });

  test('retake: templates in addedTemplateIds are left out before picking', () => {
    const stored = {kind: 'ok' as const, record: {...r.skippedRecord(), addedTemplateIds: ['skill15' as const]}};
    const pl = p.buildPlan(ANSWERS, stored, []);
    assert.deepEqual(pl.picks.map((pick) => pick.id), ['plan_top1', 'focus25', 'walk20', 'replace']);
    assert.deepEqual(pl.previous, stored.record);
  });

  test('retake: the replace habit is left out when the user already has a habit with its name', () => {
    const pl = plan({}, {kind: 'none'}, ['Clear-headed evening']);
    assert.equal(pl.picks.some((pick) => pick.kind === 'replace'), false);
  });

  test('retake with every template added and no Q10: nothing left to pick', () => {
    const stored = {kind: 'ok' as const, record: {...r.skippedRecord(), addedTemplateIds: [...st.CATALOG.map((c) => c.id)]}};
    assert.deepEqual(p.buildPlan({...ANSWERS, badHabit: null}, stored, []).picks, []);
  });

  test('an unreadable record is treated as no earlier record', () => {
    assert.equal(p.buildPlan(ANSWERS, {kind: 'corrupt'}, []).previous, null);
  });

  test('the reminder defaults to 20:00, and the fallback choices are valid times that include it', () => {
    assert.equal(p.ROUTINE_REMINDER_DEFAULT, '20:00');
    assert.ok((p.ROUTINE_TIME_CHOICES as readonly string[]).includes(p.ROUTINE_REMINDER_DEFAULT));
    for (const time of p.ROUTINE_TIME_CHOICES) assert.match(time, /^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe('createPlannedHabits: when the record is written', () => {
  test('one at a time, in card order; the finished record is saved right after the first habit, then after each', async () => {
    const pl = plan();
    const h = harness();
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: '20:00', session: EMPTY});
    assert.deepEqual(h.events.map((e) => e.type), ['add', 'save', 'add', 'save', 'add', 'save', 'add', 'save']);
    assert.deepEqual(h.adds(), ['Practise a skill 15 minutes', "Plan tomorrow's top task", 'One 25-minute focus block', 'Clear-headed evening']);
    assert.deepEqual(h.saves()[0].addedTemplateIds, ['skill15']);
    assert.equal(h.saves()[0].skipped, false);
    assert.equal(h.saves()[0].completedAt, NOW);
    assert.equal(result.failed, false);
    assert.equal(result.createdNow, 4);
    assert.deepEqual([...result.created], ['skill15', 'plan_top1', 'focus25', 'replace']);
  });

  test('addedTemplateIds gets catalog ids only, never the replace habit; Q10 is never in a saved record', async () => {
    const pl = plan();
    const h = harness();
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: EMPTY});
    assert.deepEqual(result.saved?.addedTemplateIds, ['skill15', 'plan_top1', 'focus25']);
    for (const record of h.saves()) {
      const json = r.serialiseRecord(record);
      assert.doesNotMatch(json, /alcohol|badHabit|replace/);
    }
  });

  test('the reminder time (or none) goes on every created habit', async () => {
    const pl = plan();
    for (const time of ['21:00', null]) {
      const h = harness();
      await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: time, session: EMPTY});
      for (const e of h.events) if (e.type === 'add') assert.equal(e.reminderTime, time);
    }
  });

  test('toggled-off cards are not created', async () => {
    const pl = plan();
    const h = harness();
    await p.createPlannedHabits(h.deps, {plan: pl, selected: new Set(['plan_top1']), reminderTime: null, session: EMPTY});
    assert.deepEqual(h.adds(), ["Plan tomorrow's top task"]);
    assert.deepEqual(h.saves().at(-1)?.addedTemplateIds, ['plan_top1']);
  });

  test('every card toggled off: no habit, and the finished record is saved on Start (a deliberate none)', async () => {
    const pl = plan();
    const h = harness();
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: new Set(), reminderTime: '20:00', session: EMPTY});
    assert.deepEqual(h.events.map((e) => e.type), ['save']);
    assert.equal(result.saved?.skipped, false);
    assert.deepEqual(result.saved?.addedTemplateIds, []);
    assert.equal(result.createdNow, 0);
  });

  test('retake with nothing left: Done saves the finished record and keeps the earlier ids', async () => {
    const previous = {...r.completedRecord(null, ANSWERS, 1), addedTemplateIds: [...st.CATALOG.map((c) => c.id)]};
    const pl = p.buildPlan({...ANSWERS, badHabit: null}, {kind: 'ok', record: previous}, []);
    const h = harness();
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: '20:00', session: EMPTY});
    assert.deepEqual(h.adds(), []);
    assert.deepEqual(result.saved?.addedTemplateIds, previous.addedTemplateIds);
    assert.equal(result.saved?.completedAt, NOW);
  });

  test('retake: the ids from earlier runs are kept and the new ones added', async () => {
    const previous = {...r.completedRecord(null, ANSWERS, 1), addedTemplateIds: ['walk20' as const]};
    const pl = p.buildPlan(ANSWERS, {kind: 'ok', record: previous}, []);
    const h = harness();
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: EMPTY});
    assert.deepEqual(result.saved?.addedTemplateIds, ['walk20', 'skill15', 'plan_top1', 'focus25']);
  });
});

describe('createPlannedHabits: failures and retry', () => {
  test('a failure stops the run, keeps what was created, and saves nothing more', async () => {
    const pl = plan();
    const h = harness(["Plan tomorrow's top task"]);
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: EMPTY});
    assert.equal(result.failed, true);
    assert.deepEqual(h.adds(), ['Practise a skill 15 minutes']);
    assert.deepEqual([...result.created], ['skill15']);
    assert.deepEqual(result.saved?.addedTemplateIds, ['skill15']);
    assert.equal(h.saves().length, 1);
  });

  test('retrying creates only the rest, never the same card twice', async () => {
    const pl = plan();
    const first = harness(["Plan tomorrow's top task"]);
    const failed = await p.createPlannedHabits(first.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: EMPTY});
    const second = harness();
    const result = await p.createPlannedHabits(second.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: failed});
    assert.deepEqual(second.adds(), ["Plan tomorrow's top task", 'One 25-minute focus block', 'Clear-headed evening']);
    assert.equal(result.failed, false);
    assert.deepEqual(result.saved?.addedTemplateIds, ['skill15', 'plan_top1', 'focus25']);
    assert.equal(result.saved?.completedAt, NOW);// the first save's time is kept
  });

  test('the very first creation failing saves nothing, so Skip (first run) still writes a skip record', async () => {
    const pl = plan();
    const h = harness(['Practise a skill 15 minutes']);
    const result = await p.createPlannedHabits(h.deps, {plan: pl, selected: allIds(pl), reminderTime: null, session: EMPTY});
    assert.equal(result.failed, true);
    assert.equal(result.saved, null);
    assert.equal(h.events.length, 0);
    assert.deepEqual(g.recordOnSkip('auto', result.saved !== null), r.skippedRecord());
  });

  test('Skip after a habit was created writes nothing, so the finished record and its habits stand', () => {
    assert.equal(g.recordOnSkip('auto', true), null);
    assert.equal(g.recordOnSkip('settings', true), null);
    assert.equal(g.recordOnSkip('settings', false), null);
  });
});

describe('radar geometry', () => {
  test('axis 0 points up, axis 3 down, and values are clamped to 0..1', () => {
    const top = radar.radarPoint(0, 6, 1, 100, 140, 140);
    assert.ok(Math.abs(top.x - 140) < 1e-9 && Math.abs(top.y - 40) < 1e-9);
    const bottom = radar.radarPoint(3, 6, 0.5, 100, 140, 140);
    assert.ok(Math.abs(bottom.x - 140) < 1e-9 && Math.abs(bottom.y - 190) < 1e-9);
    assert.deepEqual(radar.radarPoint(1, 6, 2, 100, 0, 0), radar.radarPoint(1, 6, 1, 100, 0, 0));
    assert.deepEqual(radar.radarPoint(1, 6, -1, 100, 5, 5), {x: 5, y: 5});
  });

  test('a polygon has one point per axis, all at the same distance for equal values', () => {
    const pts = radar.polygonPoints([0.4, 0.4, 0.4, 0.4, 0.4, 0.4], 100, 0, 0).split(' ').map((s) => s.split(',').map(Number));
    assert.equal(pts.length, 6);
    for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x, y) - 40) < 0.01);
  });
});
