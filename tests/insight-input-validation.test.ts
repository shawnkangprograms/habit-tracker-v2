// Server-side input check for generateInsight (functions/src/validateInput.js). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

const {validateInput} = await import('../functions/src/validateInput.js');
const {ICON_LABELS, MAX_HABITS} = await import('../functions/src/config.js');
const {ICON_IDS} = await import('../constants/habits.ts');

type Habit = {icon: unknown; freq: unknown; daysPerWeek: unknown; done: unknown; scheduled: unknown};

const habit = (over: Partial<Habit> = {}): Habit =>
  ({icon: 'water', freq: 'daily', daysPerWeek: 7, done: 5, scheduled: 10, ...over});

const request = (over: Record<string, unknown> = {}) =>
  ({v: 1, trackedDays: 10, streak: 2, bestWeekday: 'mon', habits: [habit()], ...over});

function reason(data: unknown): string | null {
  const result = validateInput(data);
  return result.ok ? null : result.reason;
}

describe('icon allow-list', () => {
  test('the server label table has exactly the app icon ids', () => {
    assert.deepEqual(Object.keys(ICON_LABELS).sort(), [...ICON_IDS].sort());
  });

  test('every allowed icon is accepted', () => {
    for (const icon of ICON_IDS) assert.equal(reason(request({habits: [habit({icon})]})), null, icon);
  });

  test('unknown, inherited, wrongly cased and non-string icons are rejected', () => {
    for (const icon of ['rocket', 'toString', '__proto__', 'Book', '', 7, null]) {
      assert.equal(reason(request({habits: [habit({icon})]})), 'habit_icon', String(icon));
    }
  });
});

describe('validateInput accepts', () => {
  test('a valid request, returning a copy with only the known fields', () => {
    const data = request({bestWeekday: null, habits: [habit(), habit({icon: 'run', freq: 'weekdays', daysPerWeek: 3, done: 0, scheduled: 4})]});
    const result = validateInput(data);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value, data);
    assert.notEqual(result.value, data);
  });

  test('the bounds themselves', () => {
    assert.equal(reason(request({trackedDays: 3, streak: 0})), null);
    assert.equal(reason(request({trackedDays: 30, streak: 3650})), null);
    assert.equal(reason(request({habits: Array.from({length: MAX_HABITS}, () => habit())})), null);
    assert.equal(reason(request({habits: [habit({done: 30, scheduled: 30})]})), null);
    assert.equal(reason(request({habits: [habit({freq: 'weekdays', daysPerWeek: 7})]})), null);
  });
});

describe('validateInput rejects', () => {
  test('anything that is not a plain object with exactly the top-level keys', () => {
    for (const data of [undefined, null, 'x', 3, [], new Date(), request({extra: 1})]) {
      assert.equal(reason(data), 'keys', String(data));
    }
    const {streak: _streak, ...missing} = request();
    assert.equal(reason(missing), 'keys');
  });

  test('another version', () => {
    assert.equal(reason(request({v: 2})), 'version');
    assert.equal(reason(request({v: '1'})), 'version');
  });

  test('trackedDays, streak and bestWeekday out of range or of the wrong type', () => {
    for (const trackedDays of [2, 31, 3.5, '10', null]) assert.equal(reason(request({trackedDays})), 'trackedDays');
    for (const streak of [-1, 3651, 1.5, NaN, Infinity, '2']) assert.equal(reason(request({streak})), 'streak');
    for (const bestWeekday of ['Mon', 'monday', '', 0, undefined]) assert.equal(reason(request({bestWeekday})), 'bestWeekday');
  });

  test('no habits, more than 10, or not an array', () => {
    assert.equal(reason(request({habits: []})), 'habits');
    assert.equal(reason(request({habits: Array.from({length: MAX_HABITS + 1}, () => habit())})), 'habits');
    assert.equal(reason(request({habits: {0: habit()}})), 'habits');
  });

  test('a habit with extra or missing keys (a name never gets through)', () => {
    assert.equal(reason(request({habits: [{...habit(), name: 'Read'}]})), 'habit_keys');
    const {done: _done, ...missing} = habit();
    assert.equal(reason(request({habits: [missing]})), 'habit_keys');
    assert.equal(reason(request({habits: ['water']})), 'habit_keys');
  });

  test('bad frequency and days per week', () => {
    assert.equal(reason(request({habits: [habit({freq: 'weekly'})]})), 'habit_freq');
    assert.equal(reason(request({habits: [habit({daysPerWeek: 3})]})), 'habit_daysPerWeek');// daily must be 7
    for (const daysPerWeek of [0, 8, 2.5]) {
      assert.equal(reason(request({habits: [habit({freq: 'weekdays', daysPerWeek})]})), 'habit_daysPerWeek');
    }
  });

  test('bad done and scheduled counts', () => {
    for (const scheduled of [0, 31, -1, 4.2]) assert.equal(reason(request({habits: [habit({done: 0, scheduled})]})), 'habit_scheduled');
    assert.equal(reason(request({habits: [habit({done: 11, scheduled: 10})]})), 'habit_done');
    assert.equal(reason(request({habits: [habit({done: -1})]})), 'habit_done');
    assert.equal(reason(request({habits: [habit({done: '5'})]})), 'habit_done');
  });

  test('an oversized request, before looking at its shape', () => {
    assert.equal(reason({...request(), padding: 'x'.repeat(3000)}), 'too_large');
  });
});
