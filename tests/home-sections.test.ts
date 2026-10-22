// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {ActiveHabit} from '../utils/homeSections.ts';
import type {WeekdayKey} from '../constants/habits.ts';

const s = await import('../utils/homeSections.ts');

let created = 0;
function habit(habitId: string, habitName: string, days: WeekdayKey[] | null): ActiveHabit {
  return {
    habitId, habitName, icon: 'book', reminderTime: null, alarm: 0, createdAt: ++created,
    frequencyType: days ? 'weekdays' : 'daily', days: days ?? [],
  };
}

describe('schedule summary', () => {
  test('daily, single weekday, multiple weekdays in Mon..Sun order, missing days', () => {
    assert.equal(s.scheduleSummary('daily', []), 'Every day');
    assert.equal(s.scheduleSummary('weekdays', ['wed']), 'Every Wed');
    assert.equal(s.scheduleSummary('weekdays', ['sun', 'wed', 'mon']), 'Every Mon, Wed, Sun');
    assert.equal(s.scheduleSummary('weekdays', undefined), 'Specific days');
    assert.equal(s.scheduleSummary('weekdays', []), 'Specific days');
  });
});

describe('next due day', () => {
  test('a single weekday later this week', () => {
    assert.deepEqual(s.nextDueDay(['wed'], 'mon'), {day: 'wed', inDays: 2});
  });

  test('multiple weekdays: the first one after today', () => {
    assert.deepEqual(s.nextDueDay(['mon', 'thu', 'sat'], 'tue'), {day: 'thu', inDays: 2});
  });

  test('week wrap: Saturday to Monday, Sunday to Monday', () => {
    assert.deepEqual(s.nextDueDay(['mon'], 'sat'), {day: 'mon', inDays: 2});
    assert.deepEqual(s.nextDueDay(['mon'], 'sun'), {day: 'mon', inDays: 1});
    assert.deepEqual(s.nextDueDay(['tue', 'fri'], 'fri'), {day: 'tue', inDays: 4});
  });

  test('only today\'s weekday: next week (7 days); no days: null', () => {
    assert.deepEqual(s.nextDueDay(['wed'], 'wed'), {day: 'wed', inDays: 7});
    assert.equal(s.nextDueDay([], 'wed'), null);
  });
});

describe('weekday of a local date', () => {
  test('uses the local calendar date', () => {
    assert.equal(s.weekdayOfDate('2026-10-22'), 'thu');
    assert.equal(s.weekdayOfDate('2026-10-25'), 'sun');
    assert.equal(s.weekdayOfDate('2027-01-01'), 'fri');
  });
});

describe('split into Today and Other days', () => {
  const daily = habit('d1', 'Water', null);
  const wedFri = habit('w1', 'Gym', ['wed', 'fri']);
  const sat = habit('s1', 'Swim', ['sat']);
  const monA = habit('m1', 'bike', ['mon']);
  const monB = habit('m2', 'Art', ['mon']);
  const all = [daily, wedFri, sat, monA, monB];

  test('today\'s rows come back unchanged, in their order', () => {
    const todayRows = [{habitId: 'w1', completed: 1}, {habitId: 'd1', completed: 0}];
    const {today} = s.splitHomeRows(todayRows, all, 'wed');
    assert.equal(today, todayRows);
  });

  test('other days: by next due day, then name (case-insensitive), with the next weekday', () => {
    const {other} = s.splitHomeRows([{habitId: 'd1'}, {habitId: 'w1'}], all, 'wed');
    assert.deepEqual(other.map((h) => [h.habitName, h.next, h.inDays]), [
      ['Swim', 'sat', 3],
      ['Art', 'mon', 5],
      ['bike', 'mon', 5],
    ]);
  });

  test('a habit due today never appears in Other days, even if its row is missing from today\'s list', () => {
    const {other} = s.splitHomeRows([], all, 'wed');
    const ids = other.map((h) => h.habitId);
    assert.equal(ids.includes('w1'), false);// scheduled on Wednesday
    assert.equal(ids.includes('d1'), false);// daily habits are always due
    assert.deepEqual(ids, ['s1', 'm2', 'm1']);
  });

  test('week wrap in the sort: on Saturday, Monday comes before Wednesday', () => {
    const {other} = s.splitHomeRows([{habitId: 'd1'}, {habitId: 's1'}], all, 'sat');
    assert.deepEqual(other.map((h) => h.habitId), ['m2', 'm1', 'w1']);
  });

  test('the active-habits read failed: no Other days', () => {
    assert.deepEqual(s.splitHomeRows([{habitId: 'd1'}], null, 'wed').other, []);
  });
});
