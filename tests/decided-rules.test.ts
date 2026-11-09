// Rules decided after the Part B spec red-team (docs/TEST_STRATEGY.md), tested against today's code. A rule whose fix
// has not landed yet is a todo test (Phase 1b removes the todo with the fix); a rule that pins today's behaviour is a
// normal test. S-1 lives in tests/clock-skew.test.ts. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {FIXTURE_TODAY, dayOffset} from './helpers/fixtures.ts';
import type {GamiCompletion, GamiHabit} from '../utils/gamification.ts';

const G = await import('../utils/gamification.ts');
const {dailyCompletion} = await import('../utils/dailyCompletion.ts');
const {computeVitality} = await import('../utils/vitality.ts');
const {computeRadar} = await import('../utils/radar/score.ts');
const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');
const PR = await import('../utils/packs/record.ts');
const OR = await import('../utils/onboarding/record.ts');

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('S-2: a habit created while the clock was ahead counts from today (createdDate clamped to today only)', () => {
  // Created with the clock 3 days ahead, then the clock was fixed; ticked today
  const habits: GamiHabit[] = [{habitId: 'a', createdDate: dayOffset(3), frequencyType: 'daily', days: [], deleted: false}];
  const completions: GamiCompletion[] = [{habitId: 'a', date: FIXTURE_TODAY, completed: true}];

  test('today: scheduled and done, so today is a perfect day and counts on the radar\'s and Vitality\'s inputs', {
    todo: 'S-2: createdDate is after today, so the habit is never scheduled until that date: no perfect day, no today count',
  }, () => {
    assert.deepEqual(dailyCompletion(habits, completions, FIXTURE_TODAY).today, {date: FIXTURE_TODAY, scheduled: 1, done: 1});
    assert.equal(G.computeGamification(habits, completions, FIXTURE_TODAY).perfectDays, 1);
    assert.equal(G.isScheduledOn({...habits[0], createdDate: FIXTURE_TODAY}, FIXTURE_TODAY), true);
  });

  test('only clamped to today: no past day is invented for it, so Vitality and the radar have no closed history yet', () => {
    assert.deepEqual(dailyCompletion(habits, completions, FIXTURE_TODAY).closed, []);
    assert.equal(computeVitality(dailyCompletion(habits, completions, FIXTURE_TODAY)).state, 'starting');
    const radar = computeRadar({habits: habits.map((h) => ({...h, icon: 'book'})), completions, today: FIXTURE_TODAY, packs: null, areas: {}});
    assert.equal(radar.week.starting, true);
  });
});

describe('F-1: a failed reflections read never lowers XP or level', () => {
  const unreadable = {
    getItem: async () => {
      throw new Error('CursorWindow: Row too big to fit into CursorWindow');
    },
    setItem: async () => {},
  };

  test('unreadable storage is reported as unknown, never handed to the stats load as "no reflections"', {
    todo: 'F-1: read() returns an empty record on a failed read, so the stats load drops every reflection\'s XP and the level can fall',
  }, async () => {
    const store = createReflectionsStore(unreadable);
    const result = await store.read('uid-big').then((record) => record, () => 'rejected' as const);
    assert.ok(result === 'rejected' || result === null, `got ${JSON.stringify(result)}`);
  });

  test('what is at stake today: the same account loses its reflection XP when the read fails', async () => {
    const habits: GamiHabit[] = [{habitId: 'h', createdDate: dayOffset(-10), frequencyType: 'daily', days: [], deleted: false}];
    const completions = Array.from({length: 10}, (_, i) => ({habitId: 'h', date: dayOffset(-10 + i), completed: true}));
    const reflections = completions.map((c, i) => ({habitId: 'h', date: c.date, savedAt: i + 1}));
    const readable = G.computeGamification(habits, completions, FIXTURE_TODAY, reflections);
    const failed = G.computeGamification(habits, completions, FIXTURE_TODAY, []);// what an empty record gives
    assert.equal(readable.reflectionXp - failed.reflectionXp, 10 * G.REFLECTION_XP);
    assert.ok(failed.level < readable.level);
  });
});

describe('V-1: the current schedule is applied to past days (accepted limitation, pinned so a change is deliberate)', () => {
  test('changing a daily habit to Mondays only rewrites its past perfect days, streak and Vitality; its tick XP stays', () => {
    const daily: GamiHabit = {habitId: 'h', createdDate: dayOffset(-14), frequencyType: 'daily', days: [], deleted: false};
    const mondays: GamiHabit = {...daily, frequencyType: 'weekdays', days: ['mon']};
    const completions = Array.from({length: 14}, (_, i) => ({habitId: 'h', date: dayOffset(-14 + i), completed: true}));
    const before = G.computeGamification([daily], completions, FIXTURE_TODAY);
    const after = G.computeGamification([mondays], completions, FIXTURE_TODAY);
    assert.deepEqual([before.perfectDays, after.perfectDays], [14, 2]);// FIXTURE_TODAY is a Monday: 2 Mondays in the last 14 days
    assert.equal(after.completionXp, before.completionXp);
    const v = (h: GamiHabit) => computeVitality(dailyCompletion([h], completions, FIXTURE_TODAY));
    assert.notDeepEqual(v(daily), v(mondays));
  });
});

describe('S-6: notification and celebration settings are device settings, shared by every account on the phone', () => {
  test('their keys carry no uid', () => {
    assert.match(source('services/notificationPrefs.ts'), /const KEY = 'prefs:notifications:v1';/);
    assert.match(source('services/celebrationPrefs.ts'), /const KEY = 'prefs:celebrations';/);
  });
});

describe('P-8: a newer field survives an older build re-saving the record (except where a privacy whitelist applies)', () => {
  const withFuture = JSON.stringify({
    version: 1, futureTop: 'kept',
    packs: [{id: 'calm_mind', kind: 'builtin', builtinId: 'calm_mind', name: 'Calm Mind', habitIds: ['h1'], dropped: [], createdAt: 1, order: 0, futureField: 7}],
  });

  test('a packs record still parses when it has fields this build does not know', () => {
    assert.equal(PR.parsePacks(withFuture).kind, 'ok');
  });

  test('re-saving it keeps the fields this build does not know', {
    todo: 'P-8: serialisePacks writes only the known fields, so an older build re-saving the record drops newer ones',
  }, () => {
    const parsed = PR.parsePacks(withFuture);
    assert.ok(parsed.kind === 'ok');
    const saved = JSON.parse(PR.serialisePacks(parsed.record));
    assert.equal(saved.futureTop, 'kept');
    assert.equal(saved.packs[0].futureField, 7);
  });

  test('exception: the onboarding record keeps its privacy whitelist and never saves fields it does not know', () => {
    const record = {...OR.completedRecord(null, 1), q10: 'alcohol'} as unknown as Parameters<typeof OR.serialiseRecord>[0];
    assert.doesNotMatch(OR.serialiseRecord(record), /q10|alcohol/);
  });
});
