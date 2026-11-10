// "Skip this question" (docs/ONBOARDING_SPEC.md, sections 1 and 12): every step can be skipped, a skip removes that
// answer and contributes no signal, and with no scoring answer at all the plan is the balanced set. Through the real
// flow, scoring, starters, plan, results and pack modules. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Answers, CompleteAnswers, TemplateId} from '../utils/onboarding/types.ts';
import type {StepKey} from '../utils/onboarding/flow.ts';
import type {HabitInput} from '../validation/validators.ts';

const f = await import('../utils/onboarding/flow.ts');
const p = await import('../utils/onboarding/plan.ts');
const s = await import('../utils/onboarding/scoring.ts');
const st = await import('../utils/onboarding/starters.ts');
const res = await import('../utils/onboarding/results.ts');
const c = await import('../utils/onboarding/copy.ts');
const ch = await import('../utils/packs/choose.ts');
const {checkAdd} = await import('../utils/packs/limits.ts');

// Every question answered: Mind and Health focus, a sleep struggle, Q10 answered, confident
const FULL: Answers = {
  timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'struggling', focus: ['mental', 'health'],
  challenge: 'low_energy', derails: 'stress', sleep: 'struggle', days: 'chaotic', values: ['peace_of_mind'],
  badHabit: 'gaming', confidence: 9,
};
const NO_RECORD = {kind: 'none'} as const;

function validated(answers: Answers): CompleteAnswers {
  const v = f.validateAnswers(answers);
  assert.ok(v.valid, v.valid ? '' : v.error);
  return v.value;
}
const planOf = (answers: Answers, stored: Parameters<typeof p.buildPlan>[1] = NO_RECORD, names: string[] = []) =>
  p.buildPlan(validated(answers), stored, names);
const skipped = (step: StepKey, from: Answers = FULL) => planOf(f.skipStep(from, step));
const allSkipped = (): Answers => f.STEPS.reduce((a, step) => f.skipStep(a, step), f.emptyAnswers());
const catalogIds = (plan: ReturnType<typeof planOf>) => plan.picks.filter((x) => x.kind === 'catalog').map((x) => x.id);
const minutes = (id: string) => st.CATALOG.find((t) => t.id === id)!.minutes;
const fullScores = s.scoreAxes(validated(FULL));

describe('skip each question alone: the plan builds and that answer contributes nothing', () => {
  test('Q1 time budget: the min15 caps (no single habit over 15 minutes, 30 in total)', () => {
    assert.ok(catalogIds(planOf(FULL)).some((id) => minutes(id) > 15), 'the full plan has a longer habit');
    const ids = catalogIds(skipped('timeBudget'));
    assert.ok(ids.length > 0 && ids.every((id) => minutes(id) <= 15));
    assert.ok(ids.reduce((sum, id) => sum + minutes(id), 0) <= 30);
  });

  test('Q2 occupation: neither the Career nor the Learning point; a Q5 answer from the general list stays', () => {
    const plan = skipped('occupation');
    assert.deepEqual([plan.scores.Career, plan.scores.Learning], [fullScores.Career - 1, fullScores.Learning]);
    assert.equal(plan.answers.challenge, 'low_energy');
  });

  test('Q3 habits feel: its Discipline point is gone', () => {
    assert.equal(skipped('habitsFeel').scores.Discipline, fullScores.Discipline - 1);
  });

  test('Q4 focus: both focus points are gone; the focus comes from the scores alone', () => {
    const plan = skipped('focus');
    assert.deepEqual([plan.scores.Mind, plan.scores.Health], [fullScores.Mind - 2, fullScores.Health - 2]);
    assert.equal(plan.focus, s.focusAxis(plan.scores, []));
  });

  test('Q5 challenge: its Health point and its card are gone', () => {
    const plan = skipped('challenge');
    assert.equal(plan.scores.Health, fullScores.Health - 1);
    assert.deepEqual(res.toldUsCards(plan.answers).map((x) => x.label), [c.RHYTHM_CARD_LABEL, c.DERAILS_CARD_LABEL]);
  });

  test('Q6 derails: its Mind point and its card are gone', () => {
    const plan = skipped('derails');
    assert.equal(plan.scores.Mind, fullScores.Mind - 1);
    assert.deepEqual(res.toldUsCards(plan.answers).map((x) => x.label), [c.CHALLENGE_CARD_LABEL, c.RHYTHM_CARD_LABEL]);
  });

  test('Q7 sleep: its Health point is gone and no sleep template is forced', () => {
    const career: Answers = {...FULL, focus: ['career'], challenge: 'focus', derails: 'boredom', habitsFeel: 'thriving',
      days: 'predictable', values: ['freedom'], badHabit: null, confidence: 5};
    assert.ok(catalogIds(planOf(career)).includes('lights_out'), 'forced while answered');
    const plan = skipped('sleep', career);
    assert.equal(plan.scores.Health, s.scoreAxes(validated(career)).Health - 1);
    assert.ok(!catalogIds(plan).some((id) => (st.SLEEP_TEMPLATE_IDS as readonly string[]).includes(id)));
  });

  test('Q8 days: its Discipline point and its card are gone', () => {
    const plan = skipped('days');
    assert.equal(plan.scores.Discipline, fullScores.Discipline - 1);
    assert.deepEqual(res.toldUsCards(plan.answers).map((x) => x.label), [c.CHALLENGE_CARD_LABEL, c.DERAILS_CARD_LABEL]);
  });

  test('Q9 values: its Mind point is gone', () => {
    assert.equal(skipped('values').scores.Mind, fullScores.Mind - 1);
  });

  test('Q10 bad habit: no replace habit', () => {
    assert.ok(planOf(FULL).picks.some((x) => x.kind === 'replace'));
    assert.ok(!skipped('badHabit').picks.some((x) => x.kind === 'replace'));
  });

  test('Q11 confidence: the default count (3) instead of 4', () => {
    assert.equal(catalogIds(planOf({...FULL, timeBudget: 'min60', sleep: 'good'})).length, 4);
    assert.equal(catalogIds(skipped('confidence', {...FULL, sleep: 'good'})).length, 3);
  });
});

describe('every question skipped: the balanced plan', () => {
  test('the balanced set in order, the line, no focus card, no "What you told us", no packs, no outline', () => {
    const plan = planOf(allSkipped());
    assert.equal(plan.balanced, true);
    assert.deepEqual(plan.picks.map((x) => x.id), ['water_meals', 'breathe5', 'make_bed']);
    assert.deepEqual(res.profileCard(plan), {title: c.BALANCED_LINE, subtitle: null});
    assert.equal(c.BALANCED_LINE, 'You skipped the questions, so we picked a balanced set. You can retake this from Settings any time.');
    assert.deepEqual([res.showsToldUs(plan), res.savesOutline(plan), res.createsPacks(plan)], [false, false, false]);
    const joins = [{templateId: 'water_meals' as TemplateId, habitId: 'h1'}];
    assert.equal(ch.packsAfterRun(NO_RECORD, {chosen: plan.packs, create: res.createsPacks(plan), joins, existing: [], now: 1}), null);
    const groups = ch.routineGroups(plan.picks, ch.runPacks(NO_RECORD, plan.packs, res.createsPacks(plan), 0), []);
    assert.deepEqual([groups.packs, groups.subtitle, groups.other.length], [[], null, 3]);
  });

  test('balanced whenever Q2 to Q9 are all skipped; Q1, Q10 and Q11 still apply', () => {
    const answers: Answers = {...allSkipped(), timeBudget: 'min5', badHabit: 'alcohol', confidence: 2};
    const plan = planOf(answers);
    assert.equal(plan.balanced, true);
    assert.deepEqual(plan.picks.map((x) => x.id), ['water_meals', 'breathe5', 'replace']);
    assert.equal(s.hasAreaSignal(validated(answers)), false);
  });

  test('any one scoring answer alone is an area signal (not balanced)', () => {
    const one: Partial<Answers>[] = [{occupation: 'student'}, {habitsFeel: 'alright'}, {focus: ['career']}, {challenge: 'time'},
      {derails: 'boredom'}, {sleep: 'good'}, {days: 'mostly'}, {values: ['freedom']}];
    for (const over of one) assert.equal(planOf({...allSkipped(), ...over}).balanced, false, JSON.stringify(over));
  });

  test('a balanced run still joins built-in packs the user already has', () => {
    const plan = planOf(allSkipped());
    const record = {version: 1 as const, packs: [{id: 'steady_energy', kind: 'builtin' as const, builtinId: 'steady_energy' as const,
      name: 'Steady Energy', habitIds: [], dropped: [], createdAt: 1, order: 0}]};
    const next = ch.packsAfterRun({kind: 'ok', record}, {chosen: plan.packs, create: res.createsPacks(plan),
      joins: [{templateId: 'water_meals', habitId: 'h1'}], existing: [], now: 1});
    assert.deepEqual(next?.packs.map((x) => [x.id, x.habitIds]), [['steady_energy', ['h1']]]);
  });
});

describe('the flow around a skip', () => {
  test('skip, Back, answer: empty after the skip, then the new answer counts', () => {
    const single = f.skipStep(FULL, 'derails');
    assert.equal(single.derails, null);
    assert.equal(f.canContinue(single, 'derails'), false);
    assert.equal(f.canContinue(f.selectSingle(single, 'derails', 'boredom'), 'derails'), true);
    const multi = f.skipStep(FULL, 'focus');
    assert.deepEqual(multi.focus, []);
    assert.deepEqual(f.toggleMulti(multi, 'focus', 'career').focus, ['career']);
    const slider = f.skipStep(FULL, 'confidence');
    assert.equal(slider.confidence, null);
    assert.equal(f.canContinue(slider, 'confidence'), false, 'Continue waits for a touch');
    assert.equal(f.canContinue(f.setConfidence(slider, 5), 'confidence'), true, 'a touch on 5 counts');
    assert.equal(f.canContinue(f.emptyAnswers(), 'confidence'), true, 'the first visit is unchanged');
  });

  test('Q2 and Q5: a skip keeps a general Q5 answer, clears a student-only one, and a later student pick clears it', () => {
    assert.equal(f.skipStep({...FULL, occupation: 'mid_career', challenge: 'balance'}, 'occupation').challenge, 'balance');
    assert.equal(f.skipStep({...FULL, occupation: 'student', challenge: 'memory'}, 'occupation').challenge, null);
    const afterSkip = f.skipStep({...FULL, occupation: 'mid_career', challenge: 'balance'}, 'occupation');
    assert.equal(f.selectSingle(afterSkip, 'occupation', 'student').challenge, null);
  });

  test('missing answers validate as skips; a present value must still be valid', () => {
    const v = f.validateAnswers({});
    assert.ok(v.valid);
    assert.deepEqual(v.value, {timeBudget: null, occupation: null, habitsFeel: null, focus: [], challenge: null, derails: null,
      sleep: null, days: null, values: [], badHabit: null, confidence: null});
    assert.equal(f.validateAnswers({...FULL, focus: []}).valid, true);
    assert.equal(f.validateAnswers({...FULL, sleep: 'never'}).valid, false);
  });

  test('"What you told us" cards: only the answered card questions, in order', () => {
    const none = validated(allSkipped());
    assert.deepEqual(res.toldUsCards(none), []);
    assert.deepEqual(res.toldUsCards({...none, days: 'mostly'}), [{label: c.RHYTHM_CARD_LABEL, line: c.RHYTHM_LINES.mostly}]);
    assert.equal(res.showsToldUs(planOf({...allSkipped(), focus: ['career']})), true, 'an area signal shows the first moves');
  });
});

describe('skips with a Settings retake', () => {
  test('the balanced set leaves out templates added before or held by name, and its fallbacks fill in', () => {
    const stored = {kind: 'ok' as const, record: {version: 1 as const, skipped: false, answers: null, completedAt: 1,
      addedTemplateIds: ['water_meals'] as TemplateId[]}};
    const plan = planOf({...allSkipped(), timeBudget: 'min5', confidence: 8}, stored, ['  breathe for 5  MINUTES']);
    assert.deepEqual(plan.picks.map((x) => x.id), ['make_bed', 'thank_someone', 'eat_produce', 'lights_out']);
  });

  test('with only Q10 answered, the replace habit is still left out when the user already has its name', () => {
    const plan = planOf({...allSkipped(), badHabit: 'alcohol'}, NO_RECORD, ['clear-headed EVENING']);
    assert.equal(plan.balanced, true);
    assert.ok(!plan.picks.some((x) => x.kind === 'replace'));
  });

  test('an all-skipped retake at the habit limit creates only up to the room and names the level from the count', async () => {
    const plan = planOf(allSkipped());
    const check = checkAdd({level: 3, kind: 'habits', count: 15, adding: plan.picks.length});
    assert.ok(!check.ok && check.room === 1 && /level 4 /.test(check.message));
    const adds: string[] = [];
    const result = await p.createPlannedHabits({
      addHabit: async (input: HabitInput) => {
        adds.push(input.habitName);
        return `id${adds.length}`;
      },
      saveRecord: async () => {},
      now: () => 1,
    }, {plan, selected: new Set(plan.picks.map((x) => x.id)), reminderTime: null, session: {created: new Set(), saved: null}, room: check.room});
    assert.deepEqual([adds, result.limited], [['Drink water with each meal'], true]);
  });
});
