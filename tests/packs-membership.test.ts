// Pack membership (utils/packs/membership.ts), what an onboarding run writes and how the routine groups its cards
// (utils/packs/choose.ts), and "Add the rest" with the add-habit call and the save injected
// (utils/packs/addRest.ts). docs/PACKS_REPORTS_SPEC.md, sections 2, 2b and 3.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {HabitInput} from '../validation/validators.ts';
import type {PacksRecord} from '../utils/packs/record.ts';
import type {HabitRef} from '../utils/packs/membership.ts';
import type {CompleteAnswers, TemplateId} from '../utils/onboarding/types.ts';

const m = await import('../utils/packs/membership.ts');
const ch = await import('../utils/packs/choose.ts');
const ar = await import('../utils/packs/addRest.ts');
const r = await import('../utils/packs/record.ts');
const st = await import('../utils/onboarding/starters.ts');
const {validateHabitInput} = await import('../validation/validators.ts');

const NOW = 1_762_000_000_000;

function packOf(id: 'steady_energy' | 'calm_mind' | 'career_builder', habitIds: string[] = [], order = 0) {
  const names = {steady_energy: 'Steady Energy', calm_mind: 'Calm Mind', career_builder: 'Career Builder'};
  return {id, kind: 'builtin' as const, builtinId: id, name: names[id], habitIds, dropped: [] as TemplateId[], createdAt: 1, order};
}
const record = (...packs: ReturnType<typeof packOf>[]): PacksRecord => ({version: 1, packs});

describe('membership', () => {
  test('names match after trimming, collapsing inner spaces and ignoring case', () => {
    assert.equal(m.normaliseHabitName('  Walk   for 20\tMINUTES '), 'walk for 20 minutes');
  });

  test('missing templates: not present by name, not dropped, deleted habits ignored, in card order', () => {
    const habits: HabitRef[] = [{habitId: 'a', habitName: 'walk for 20 minutes'}, {habitId: 'b', habitName: 'Something'}];
    const rec = record({...packOf('steady_energy', ['a', 'gone']), dropped: ['water_meals']});
    assert.deepEqual(m.missingTemplates(rec, 'steady_energy', habits), ['stretch10', 'eat_produce']);
    assert.deepEqual(m.missingTemplates(rec, 'nope', habits), []);
  });

  test('adoption: an unpacked habit with a missing template\'s name joins; one already in a pack does not', () => {
    const habits: HabitRef[] = [
      {habitId: 'a', habitName: ' STRETCH  for 10 minutes'},
      {habitId: 'b', habitName: 'Drink water with each meal'},
      {habitId: 'c', habitName: 'Drink water with each meal'},// a second one: only the first joins
      {habitId: 'd', habitName: 'Walk for 20 minutes'},
    ];
    const rec = record(packOf('steady_energy'), packOf('calm_mind', ['d'], 1));
    const next = m.adoptExisting(rec, 'steady_energy', habits);
    assert.deepEqual(next.packs[0].habitIds, ['a', 'b']);
    assert.deepEqual(next.packs[1].habitIds, ['d']);
    assert.equal(m.adoptExisting(next, 'steady_energy', habits), next);// nothing more: the same object
  });

  test('a habit is never added to a second pack; deleted habits drop out of membership', () => {
    const rec = record(packOf('steady_energy', ['a']), packOf('calm_mind', [], 1));
    assert.equal(m.addToPack(rec, 'calm_mind', 'a'), rec);
    assert.deepEqual(m.addToPack(rec, 'calm_mind', 'b').packs[1].habitIds, ['b']);
    assert.deepEqual(m.withoutDeleted(rec, new Set()).packs[0].habitIds, []);
  });
});

describe('what an onboarding run writes (packsAfterRun)', () => {
  const chosen = ['steady_energy', 'calm_mind'] as const;
  const run = (over: Partial<Parameters<typeof ch.packsAfterRun>[1]> = {}) => ({
    chosen, create: true, joins: [], existing: [], now: NOW, ...over,
  });

  test('first run, no record: the two packs in order, with only ids, names and times', () => {
    const next = ch.packsAfterRun({kind: 'none'}, run());
    assert.ok(next);
    assert.deepEqual(next.packs.map((p) => [p.id, p.name, p.order, p.createdAt, p.habitIds]),
      [['steady_energy', 'Steady Energy', 0, NOW, []], ['calm_mind', 'Calm Mind', 1, NOW, []]]);
    assert.doesNotMatch(r.serialisePacks(next), /score|answer|focus|badHabit|"area"/);
  });

  test('starters join the pack of their template; the others stay "other habits"', () => {
    const joins = [
      {templateId: 'walk20' as const, habitId: 'h1'},
      {templateId: 'lights_out' as const, habitId: 'h2'},
      {templateId: 'focus25' as const, habitId: 'h3'},// Career Builder was not chosen
    ];
    const next = ch.packsAfterRun({kind: 'none'}, run({joins}));
    assert.deepEqual(next?.packs.map((p) => p.habitIds), [['h1'], ['h2']]);
  });

  test('idempotent across the repeated saves; null when nothing changes', () => {
    const first = ch.packsAfterRun({kind: 'none'}, run({joins: [{templateId: 'walk20', habitId: 'h1'}]}))!;
    const joins = [{templateId: 'walk20' as const, habitId: 'h1'}, {templateId: 'breathe5' as const, habitId: 'h2'}];
    const second = ch.packsAfterRun({kind: 'ok', record: first}, run({joins}))!;
    assert.deepEqual(second.packs.map((p) => p.habitIds), [['h1'], ['h2']]);
    assert.equal(ch.packsAfterRun({kind: 'ok', record: second}, run({joins})), null);
  });

  test('on creation, existing unpacked habits with a template\'s name are adopted, but not over this run\'s starter', () => {
    const existing: HabitRef[] = [{habitId: 'old1', habitName: 'walk for 20 minutes'}, {habitId: 'old2', habitName: ' breathe for 5 minutes'}];
    const next = ch.packsAfterRun({kind: 'none'}, run({existing, joins: [{templateId: 'walk20', habitId: 'new1'}]}));
    assert.deepEqual(next?.packs.map((p) => p.habitIds), [['new1'], ['old2']]);
  });

  test('no habit made yet (Start with nothing selected): no packs are created', () => {
    assert.equal(ch.packsAfterRun({kind: 'none'}, run({create: false})), null);
    assert.equal(ch.packsAfterRun({kind: 'ok', record: record()}, run({create: false})), null);
  });

  test('no packs (no record, or an empty one), any run that made a habit: the two packs are created, with adoption', () => {
    const existing: HabitRef[] = [{habitId: 'old', habitName: 'Breathe  for 5 MINUTES'}];
    for (const parsed of [{kind: 'none'} as const, {kind: 'ok', record: record()} as const]) {
      const next = ch.packsAfterRun(parsed, run({existing, joins: [{templateId: 'walk20', habitId: 'h1'}]}));
      assert.deepEqual(next?.packs.map((p) => [p.id, p.habitIds]), [['steady_energy', ['h1']], ['calm_mind', ['old']]], parsed.kind);
    }
  });

  test('when packs exist, a run only joins the ones the user has and never creates new ones', () => {
    const mine = record(packOf('career_builder'));
    const next = ch.packsAfterRun({kind: 'ok', record: mine}, run({joins: [
      {templateId: 'walk20', habitId: 'h1'}, {templateId: 'skill15', habitId: 'h2'},
    ]}));
    assert.deepEqual(next?.packs.map((p) => [p.id, p.habitIds]), [['career_builder', ['h2']]]);
  });

  test('a template dropped from its pack joins nothing; a corrupt record is never written over', () => {
    const mine = record({...packOf('steady_energy'), dropped: ['walk20']});
    assert.equal(ch.packsAfterRun({kind: 'ok', record: mine}, run({joins: [{templateId: 'walk20', habitId: 'h1'}]})), null);
    assert.equal(ch.packsAfterRun({kind: 'corrupt'}, run({joins: [{templateId: 'walk20', habitId: 'h1'}]})), null);
  });
});

describe('the routine\'s groups', () => {
  const BASE: CompleteAnswers = {
    timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
    derails: 'boredom', sleep: 'struggle', days: 'predictable', values: ['freedom'], badHabit: 'gaming', confidence: 5,
  };
  const picks = st.pickStarters(BASE);// focus25, walk20, lights_out (forced), replace
  const chosen = ['career_builder', 'steady_energy'] as const;
  const ids = (list: {id: string}[]) => list.map((p) => p.id);

  test('first run: each card under its pack, chosen packs first; the sleep pick and the replace pick under other', () => {
    assert.deepEqual(ids(picks), ['focus25', 'walk20', 'lights_out', 'replace']);
    const groups = ch.routineGroups(picks, ch.runPacks({kind: 'none'}, chosen, true, 0), chosen);
    assert.deepEqual(groups.packs.map((g) => [g.name, ids(g.picks)]), [['Career Builder', ['focus25']], ['Steady Energy', ['walk20']]]);
    assert.deepEqual(ids(groups.other), ['lights_out', 'replace']);
    assert.deepEqual(groups.subtitle, ['Career Builder', 'Steady Energy']);
  });

  test('an empty record groups like no record (the run will create the packs)', () => {
    const groups = ch.routineGroups(picks, ch.runPacks({kind: 'ok', record: record()}, chosen, true, 0), chosen);
    assert.deepEqual(groups.packs.map((g) => g.name), ['Career Builder', 'Steady Energy']);
    assert.deepEqual(groups.subtitle, ['Career Builder', 'Steady Energy']);
  });

  test('a corrupt record: everything under other, no subtitle', () => {
    const groups = ch.routineGroups(picks, ch.runPacks({kind: 'corrupt'}, chosen, true, 0), chosen);
    assert.deepEqual(groups.packs, []);
    assert.equal(groups.other.length, picks.length);
    assert.equal(groups.subtitle, null);
  });

  test('retake with other packs: cards join the packs the user has; the subtitle only when both chosen exist', () => {
    const mine = record(packOf('steady_energy'));
    const groups = ch.routineGroups(picks, ch.runPacks({kind: 'ok', record: mine}, chosen, true, 0), chosen);
    assert.deepEqual(groups.packs.map((g) => [g.name, ids(g.picks)]), [['Steady Energy', ['walk20']]]);
    assert.deepEqual(ids(groups.other), ['focus25', 'lights_out', 'replace']);
    assert.equal(groups.subtitle, null);
  });

  test('the groups agree with what packsAfterRun writes', () => {
    const joins = [{templateId: 'focus25' as const, habitId: 'h1'}, {templateId: 'walk20' as const, habitId: 'h2'},
      {templateId: 'lights_out' as const, habitId: 'h3'}];
    const written = ch.packsAfterRun({kind: 'none'}, {chosen, create: true, joins, existing: [], now: NOW})!;
    assert.deepEqual(written.packs.map((p) => [p.name, p.habitIds]), [['Career Builder', ['h1']], ['Steady Energy', ['h2']]]);
  });
});

describe('"Add the rest"', () => {
  type Event = {type: 'add'; name: string} | {type: 'save'; ids: string[]};

  function harness(opts: {failAdd?: string[]; failSave?: number[]; prefix?: string} = {}) {
    const events: Event[] = [];
    let n = 0;
    let saves = 0;
    return {
      events,
      adds: () => events.flatMap((e) => (e.type === 'add' ? [e.name] : [])),
      deps: {
        addHabit: async (input: HabitInput) => {
          assert.equal(validateHabitInput(input).valid, true, input.habitName);
          assert.deepEqual(input.frequency, {type: 'daily'});
          if (opts.failAdd?.includes(input.habitName)) throw new Error('disk full');
          events.push({type: 'add', name: input.habitName});
          n += 1;
          return `${opts.prefix ?? 'new'}${n}`;
        },
        savePacks: async (rec: PacksRecord) => {
          saves += 1;
          if (opts.failSave?.includes(saves)) throw new Error('save failed');
          events.push({type: 'save', ids: rec.packs[0].habitIds});
        },
      },
    };
  }
  const start = record(packOf('steady_energy', ['w']));
  const habits: HabitRef[] = [{habitId: 'w', habitName: 'Walk for 20 minutes'}];
  const input = (over: Partial<Parameters<typeof ar.addTheRest>[1]> = {}) => ({
    record: start, packId: 'steady_energy', habits, level: 1, reminderTime: '20:00', ...over,
  });

  test('creates the missing templates in card order, saving after each', async () => {
    const h = harness();
    const result = await ar.addTheRest(h.deps, input());
    assert.deepEqual(h.adds(), ['Stretch for 10 minutes', 'Drink water with each meal', 'Eat one fruit or vegetable']);
    assert.deepEqual(h.events.map((e) => e.type), ['add', 'save', 'add', 'save', 'add', 'save']);
    assert.deepEqual(result.record.packs[0].habitIds, ['w', 'new1', 'new2', 'new3']);
    assert.deepEqual({added: result.added, failed: result.failed, limited: result.limited}, {added: 3, failed: false, limited: false});
  });

  test('a failure stops the run; tapping again creates only the rest, never twice', async () => {
    const first = harness({failAdd: ['Drink water with each meal']});
    const failed = await ar.addTheRest(first.deps, input());
    assert.equal(failed.failed, true);
    assert.deepEqual(first.adds(), ['Stretch for 10 minutes']);
    const nowHabits = [...habits, {habitId: 'new1', habitName: 'Stretch for 10 minutes'}];
    const second = harness({prefix: 'b'});
    const result = await ar.addTheRest(second.deps, input({record: failed.record, habits: nowHabits}));
    assert.deepEqual(second.adds(), ['Drink water with each meal', 'Eat one fruit or vegetable']);
    assert.equal(result.failed, false);
    assert.deepEqual(result.record.packs[0].habitIds, ['w', 'new1', 'b1', 'b2']);
  });

  test('a habit whose save failed is adopted by name next time, not created again', async () => {
    const first = harness({failSave: [1]});
    const failed = await ar.addTheRest(first.deps, input());
    assert.equal(failed.failed, true);
    assert.deepEqual(failed.record.packs[0].habitIds, ['w']);// the save of new1 failed
    const nowHabits = [...habits, {habitId: 'new1', habitName: 'Stretch for 10 minutes'}];
    const second = harness({prefix: 'b'});
    const result = await ar.addTheRest(second.deps, input({record: failed.record, habits: nowHabits}));
    assert.deepEqual(second.adds(), ['Drink water with each meal', 'Eat one fruit or vegetable']);
    assert.deepEqual(result.record.packs[0].habitIds, ['w', 'new1', 'b1', 'b2']);
  });

  test('stops at the habit limit with the rest still missing; above the limit adds nothing', async () => {
    const eleven = [...habits, ...Array.from({length: 10}, (_, i) => ({habitId: `x${i}`, habitName: `Other ${i}`}))];
    const h = harness();
    const result = await ar.addTheRest(h.deps, input({habits: eleven}));
    assert.deepEqual(h.adds(), ['Stretch for 10 minutes']);
    assert.deepEqual({added: result.added, limited: result.limited}, {added: 1, limited: true});

    const many = [...habits, ...Array.from({length: 20}, (_, i) => ({habitId: `y${i}`, habitName: `Other ${i}`}))];
    const none = harness();
    const blocked = await ar.addTheRest(none.deps, input({habits: many}));
    assert.deepEqual(none.events, []);
    assert.equal(blocked.limited, true);
  });

  test('nothing missing: nothing happens', async () => {
    const full = record({...packOf('steady_energy', ['w']), dropped: ['stretch10', 'water_meals', 'eat_produce']});
    const h = harness();
    const result = await ar.addTheRest(h.deps, input({record: full}));
    assert.deepEqual(h.events, []);
    assert.deepEqual({added: result.added, failed: result.failed, limited: result.limited}, {added: 0, failed: false, limited: false});
  });
});
