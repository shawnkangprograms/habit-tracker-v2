// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {isDeepEqual} from '../utils/equality.ts';

// Shapes Home compares: a stats snapshot and a list of habit rows
const snapshot = () => ({
  date: '2026-10-21',
  stats: {
    completionXp: 120, perfectDays: 2, perfectDayXp: 40, milestoneXp: 0, totalXp: 160,
    currentStreak: 3, longestStreak: 5, perHabitStreaks: {h1: 3, h2: 0} as Record<string, number>, badges: [3],
    level: 2, xpIntoLevel: 10, xpForNextLevel: 100, progress: 0.1,
  },
});

const habits = () => [
  {habitId: 'h1', habitName: 'Read', icon: 'book', frequencyType: 'daily', reminderTime: null, completed: 0},
  {habitId: 'h2', habitName: 'Run', icon: 'run', frequencyType: 'weekdays', reminderTime: '07:30', completed: 1,
    days: ['mon', 'wed', 'fri']},
];

describe('isDeepEqual', () => {
  test('fresh copies of the same data are equal', () => {
    assert.equal(isDeepEqual(snapshot(), snapshot()), true);
    assert.equal(isDeepEqual(habits(), habits()), true);
    assert.equal(isDeepEqual([], []), true);
    assert.equal(isDeepEqual(null, null), true);
  });

  test('a change in any stats field is detected, including nested streaks and badges', () => {
    const top = snapshot();
    top.date = '2026-10-22';
    assert.equal(isDeepEqual(snapshot(), top), false);

    const streak = snapshot();
    streak.stats.perHabitStreaks.h2 = 1;
    assert.equal(isDeepEqual(snapshot(), streak), false);

    const newHabitStreak = snapshot();
    newHabitStreak.stats.perHabitStreaks.h3 = 0;
    assert.equal(isDeepEqual(snapshot(), newHabitStreak), false);

    const badge = snapshot();
    badge.stats.badges = [3, 7];
    assert.equal(isDeepEqual(snapshot(), badge), false);

    const progress = snapshot();
    progress.stats.progress = 0.2;
    assert.equal(isDeepEqual(snapshot(), progress), false);
  });

  test('a change in any habit row is detected, including the days array and its order', () => {
    const toggled = habits();
    toggled[0].completed = 1;
    assert.equal(isDeepEqual(habits(), toggled), false);

    const days = habits();
    days[1].days = ['mon', 'wed'];
    assert.equal(isDeepEqual(habits(), days), false);

    const order = habits();
    order[1].days = ['wed', 'mon', 'fri'];
    assert.equal(isDeepEqual(habits(), order), false);

    assert.equal(isDeepEqual(habits(), [...habits()].reverse()), false);
    assert.equal(isDeepEqual(habits(), habits().slice(0, 1)), false);
  });

  test('null, missing keys and type mismatches are never equal', () => {
    assert.equal(isDeepEqual(null, snapshot()), false);
    assert.equal(isDeepEqual(snapshot(), null), false);
    assert.equal(isDeepEqual({a: undefined}, {}), false); // a missing field counts as a change
    assert.equal(isDeepEqual({a: 1}, {b: 1}), false);
    assert.equal(isDeepEqual([1], {0: 1}), false);
    assert.equal(isDeepEqual(0, '0'), false);
    assert.equal(isDeepEqual(null, undefined), false);
  });
});
