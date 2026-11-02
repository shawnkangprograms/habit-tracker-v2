// The insight request builder (utils/insightInput.ts), fed by the real Summary maths. Every request it builds
// must pass the server's own check (functions/src/validateInput.js). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {WeekdayKey} from '@/constants/habits';
import type {GamiCompletion} from '@/utils/gamification';
import type {SummaryHabit} from '@/utils/summary';
import type {InsightInputResult} from '@/utils/insightInput';

const {buildInsightInput, MAX_HABITS} = await import('../utils/insightInput.ts');
const {computeSummary} = await import('../utils/summary.ts');
const {fromDayNumber, toDayNumber} = await import('../utils/gamification.ts');
const {validateInput} = await import('../functions/src/validateInput.js');

// TODAY 2026-10-29 is a Thursday. The 30-day window is 09-30 (Wed) .. 10-29; past days 09-30 .. 10-28.
// Tuesdays in it: 10-06, 13, 20, 27. Wednesdays: 09-30, 10-07, 14, 21, 28. Past Thursdays: 10-01, 08, 15, 22.
const TODAY = '2026-10-29';

const daily = (habitId: string, createdDate: string, over: Partial<SummaryHabit> = {}): SummaryHabit =>
  ({habitId, habitName: `Name of ${habitId}`, icon: 'water', createdDate, frequencyType: 'daily', days: [], deleted: false, ...over});

const onDays = (habitId: string, days: WeekdayKey[], createdDate: string, over: Partial<SummaryHabit> = {}): SummaryHabit =>
  daily(habitId, createdDate, {frequencyType: 'weekdays', days, ...over});

const doneOn = (habitId: string, dates: string[]): GamiCompletion[] => dates.map((date) => ({habitId, date, completed: true}));

// Every date from `from` to `to`, inclusive
function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let n = toDayNumber(from); n <= toDayNumber(to); n++) out.push(fromDayNumber(n));
  return out;
}

function build(habits: SummaryHabit[], completions: GamiCompletion[] = []): InsightInputResult {
  return buildInsightInput(computeSummary(habits, completions, TODAY), habits);
}

// The request, after checking it passes the server's validation unchanged
function requestOf(result: InsightInputResult) {
  assert.equal(result.ok, true, 'expected a request');
  if (!result.ok) throw new Error('unreachable');
  const checked = validateInput(result.request);
  assert.equal(checked.ok, true, `server rejects the request: ${checked.ok ? '' : checked.reason}`);
  if (checked.ok) assert.deepEqual(checked.value, result.request);
  return result.request;
}

describe('eligibility', () => {
  test('fewer than 3 tracked past days: notEnoughData (today does not count)', () => {
    assert.deepEqual(build([daily('a', '2026-10-27')], doneOn('a', ['2026-10-27', '2026-10-28', TODAY])), {ok: false, reason: 'notEnoughData'});
    assert.deepEqual(build([]), {ok: false, reason: 'notEnoughData'});
  });

  test('exactly 3 tracked past days, misses included: a request', () => {
    const request = requestOf(build([daily('a', '2026-10-26')]));
    assert.equal(request.trackedDays, 3);
    assert.deepEqual(request.habits, [{icon: 'water', freq: 'daily', daysPerWeek: 7, done: 0, scheduled: 3}]);
  });

  test('tracked days with only habits that cannot be sent: noHabits', () => {
    assert.deepEqual(build([daily('a', '2026-10-01', {icon: 'rocket'})]), {ok: false, reason: 'noHabits'});
  });

  test('a full window counts 29 past days', () => {
    assert.equal(requestOf(build([daily('a', '2026-09-01')])).trackedDays, 29);
  });
});

describe('habits', () => {
  test('never carries a habit name or id', () => {
    const request = requestOf(build([daily('habit-123', '2026-10-01', {habitName: 'Call mum at 6'})], doneOn('habit-123', ['2026-10-20'])));
    const json = JSON.stringify(request);
    assert.doesNotMatch(json, /Call mum|habit-123|Name of/);
    assert.deepEqual(Object.keys(request.habits[0]).sort(), ['daysPerWeek', 'done', 'freq', 'icon', 'scheduled']);
  });

  test('30-day counts follow the summary rules: today counts once done', () => {
    const habits = [daily('a', '2026-10-20'), daily('b', '2026-10-20', {icon: 'run'})];
    const request = requestOf(build(habits, [...doneOn('a', ['2026-10-20', '2026-10-21', TODAY]), ...doneOn('b', ['2026-10-22'])]));
    assert.deepEqual(request.habits, [
      {icon: 'water', freq: 'daily', daysPerWeek: 7, done: 3, scheduled: 10},// 10-20..10-28 plus today, done
      {icon: 'run', freq: 'daily', daysPerWeek: 7, done: 1, scheduled: 9},
    ]);
  });

  test('weekday habits send their number of distinct days', () => {
    const request = requestOf(build([onDays('a', ['mon', 'wed', 'fri'], '2026-10-01', {icon: 'book'})]));
    assert.equal(request.habits[0].freq, 'weekdays');
    assert.equal(request.habits[0].daysPerWeek, 3);
  });

  test('skipped: deleted, created today and not done, unknown icon, weekdays without days', () => {
    const habits = [
      daily('keep', '2026-10-01'),
      daily('deleted', '2026-10-01', {deleted: true}),
      daily('new', TODAY, {icon: 'run'}),
      daily('odd', '2026-10-01', {icon: 'rocket'}),
      onDays('empty', [], '2026-10-01', {icon: 'book'}),
    ];
    assert.deepEqual(requestOf(build(habits)).habits.map((h) => h.icon), ['water']);
  });

  test('a habit created today and already done is sent with one day', () => {
    const request = requestOf(build([daily('old', '2026-10-01'), daily('new', TODAY, {icon: 'run'})], doneOn('new', [TODAY])));
    assert.deepEqual(request.habits.find((h) => h.icon === 'run'), {icon: 'run', freq: 'daily', daysPerWeek: 7, done: 1, scheduled: 1});
  });

  test('at most 10, ranked by scheduled days, then icon id, then habit id', () => {
    const icons = ['work', 'book', 'star', 'money', 'run', 'water', 'music', 'food', 'heart', 'sleep', 'study', 'meditate'] as const;
    // h00..h11 created one day apart: h00 has the most scheduled days
    const habits = icons.map((icon, i) => daily(`h${String(i).padStart(2, '0')}`, fromDayNumber(toDayNumber('2026-10-10') + i), {icon}));
    habits.push(daily('tie-b', '2026-10-10', {icon: 'book'}), daily('tie-a', '2026-10-10', {icon: 'book'}));
    const request = requestOf(build(habits));
    assert.equal(request.habits.length, MAX_HABITS);
    assert.deepEqual(request.habits.map((h) => [h.icon, h.scheduled]), [
      ['book', 19], ['book', 19], ['work', 19],// 19 days each: icon id order (book before work)
      ['book', 18], ['star', 17], ['money', 16], ['run', 15], ['water', 14], ['music', 13], ['food', 12],
    ]);
  });
});

describe('streak and best weekday', () => {
  test('the streak is the overall current streak, capped at 3650', () => {
    const habits = [daily('a', '2026-10-01')];
    const completions = doneOn('a', range('2026-10-25', '2026-10-28'));
    assert.equal(requestOf(build(habits, completions)).streak, 4);
    const summary = {...computeSummary(habits, completions, TODAY), currentStreak: 5000};
    assert.equal(requestOf(buildInsightInput(summary, habits)).streak, 3650);
  });

  test('the weekday with the single highest share wins', () => {
    const request = requestOf(build([daily('a', '2026-09-01')], doneOn('a', ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-10-14'])));
    assert.equal(request.bestWeekday, 'tue');
  });

  test('a tie, a top share of 0, or fewer than 7 tracked days gives null', () => {
    // one of 4 Tuesdays and one of 4 past Thursdays (10-01, 08, 15, 22): tied
    const tie = build([daily('a', '2026-09-01')], doneOn('a', ['2026-10-13', '2026-10-15']));
    assert.equal(requestOf(tie).bestWeekday, null);
    assert.equal(requestOf(build([daily('a', '2026-09-01')])).bestWeekday, null);
    const short = build([daily('a', '2026-10-23')], doneOn('a', ['2026-10-27']));// 6 tracked days
    assert.equal(requestOf(short).bestWeekday, null);
  });

  test('today is ignored for the best weekday (it is still open)', () => {
    const request = requestOf(build([daily('a', '2026-09-01')], doneOn('a', ['2026-10-14', TODAY])));
    assert.equal(request.bestWeekday, 'wed');
  });
});
