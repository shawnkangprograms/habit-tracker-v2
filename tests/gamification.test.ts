// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import type {WeekdayKey} from '@/constants/habits';
import {
  computeGamification, computeStreaks, countPerfectDays, diffStats, isScheduledOn, levelFromXp,
  type GamiCompletion, type GamiHabit,
} from '../utils/gamification.ts';

// Fixture dates: 2026-10-23 is a Friday, 10-24 Saturday, 10-25 Sunday, 10-26 Monday.

const daily = (habitId: string, createdDate: string, deleted = false): GamiHabit =>
  ({habitId, createdDate, frequencyType: 'daily', days: [], deleted});

const onDays = (habitId: string, days: WeekdayKey[], createdDate: string, deleted = false): GamiHabit =>
  ({habitId, createdDate, frequencyType: 'weekdays', days, deleted});

const done = (habitId: string, date: string, completed = true): GamiCompletion => ({habitId, date, completed});

// Consecutive dates in October 2026, e.g. octDays(19, 21) -> 2026-10-19, 10-20, 10-21
const octDays = (from: number, to: number): string[] =>
  Array.from({length: to - from + 1}, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`);

describe('XP', () => {
  test('zero data', () => {
    const s = computeGamification([], [], '2026-10-21');
    assert.equal(s.totalXp, 0);
    assert.equal(s.completionXp, 0);
    assert.equal(s.perfectDays, 0);
    assert.equal(s.milestoneXp, 0);
    assert.equal(s.currentStreak, 0);
    assert.equal(s.longestStreak, 0);
    assert.deepEqual(s.badges, []);
    assert.deepEqual(s.perHabitStreaks, {});
    assert.deepEqual([s.level, s.xpIntoLevel, s.xpForNextLevel, s.progress], [1, 0, 50, 0]);
  });

  test('one completion: 10 XP plus a perfect day', () => {
    const s = computeGamification([daily('a', '2026-10-21')], [done('a', '2026-10-21')], '2026-10-21');
    assert.equal(s.completionXp, 10);
    assert.equal(s.perfectDays, 1);
    assert.equal(s.perfectDayXp, 20);
    assert.equal(s.totalXp, 30);
    assert.equal(s.currentStreak, 1);
  });

  test('an un-checked row gives zero XP', () => {
    const s = computeGamification([daily('a', '2026-10-21')], [done('a', '2026-10-21', false)], '2026-10-21');
    assert.equal(s.completionXp, 0);
    assert.equal(s.perfectDays, 0);
    assert.equal(s.totalXp, 0);
    assert.equal(s.currentStreak, 0);
  });

  test('perfect day with one habit', () => {
    const habits = [daily('a', '2026-10-20')];
    assert.equal(countPerfectDays(habits, [done('a', '2026-10-20')], '2026-10-21'), 1);
  });

  test('perfect day with several habits; missing one habit is not perfect', () => {
    const habits = [daily('a', '2026-10-19'), daily('b', '2026-10-19'), daily('c', '2026-10-19')];
    const completions = [
      done('a', '2026-10-19'), done('b', '2026-10-19'), done('c', '2026-10-19'), // perfect
      done('a', '2026-10-20'), done('b', '2026-10-20'), done('c', '2026-10-20', false), // c missed
    ];
    const s = computeGamification(habits, completions, '2026-10-21');
    assert.equal(s.perfectDays, 1);
    assert.equal(s.completionXp, 50);
  });

  test('deleted habit keeps its XP but is ignored for perfect-day scheduling', () => {
    const habits = [daily('a', '2026-10-19'), daily('gone', '2026-10-19', true)];
    const completions = [
      done('a', '2026-10-19'), // perfect: the deleted habit isn't required
      done('gone', '2026-10-20'), // still earns 10 XP; a was missed, so not perfect
    ];
    const s = computeGamification(habits, completions, '2026-10-21');
    assert.equal(s.completionXp, 20);
    assert.equal(s.perfectDays, 1);
  });

  test('habit created mid-history is not required on earlier dates', () => {
    const habits = [daily('a', '2026-10-01'), daily('b', '2026-10-04')];
    const completions = [
      ...octDays(1, 5).map((d) => done('a', d)),
      ...octDays(4, 5).map((d) => done('b', d)),
    ];
    const s = computeGamification(habits, completions, '2026-10-05');
    assert.equal(s.perfectDays, 5);
    assert.equal(s.currentStreak, 5);
  });

  test('future-dated rows are ignored', () => {
    const habits = [daily('a', '2026-10-21')];
    const s = computeGamification(habits, [done('a', '2026-10-22'), done('a', '2026-11-30')], '2026-10-21');
    assert.equal(s.completionXp, 0);
    assert.equal(s.perfectDays, 0);
    assert.equal(s.longestStreak, 0);
    assert.equal(s.totalXp, 0);
  });

  test('worked total: completions + perfect days + milestone, and the level it gives', () => {
    const habits = [daily('a', '2026-10-19')];
    const s = computeGamification(habits, octDays(19, 21).map((d) => done('a', d)), '2026-10-21');
    assert.equal(s.completionXp, 30);
    assert.equal(s.perfectDayXp, 60);
    assert.equal(s.milestoneXp, 25);
    assert.equal(s.totalXp, 115);
    assert.deepEqual([s.level, s.xpIntoLevel, s.xpForNextLevel, s.progress], [2, 65, 100, 0.65]);
  });
});

describe('streaks', () => {
  test('a weekday habit skipped on the weekend does not break the streak', () => {
    const habits = [onDays('a', ['mon', 'tue', 'wed', 'thu', 'fri'], '2026-10-23')];
    assert.equal(isScheduledOn(habits[0], '2026-10-24'), false); // Saturday
    assert.equal(isScheduledOn(habits[0], '2026-10-26'), true); // Monday
    const s = computeStreaks(habits, [done('a', '2026-10-23'), done('a', '2026-10-26')], '2026-10-26');
    assert.equal(s.currentStreak, 2);
    assert.equal(s.longestStreak, 2);
  });

  test('today still open keeps the streak; yesterday missed breaks it', () => {
    const habits = [daily('a', '2026-10-19')];
    const open = computeStreaks(habits, [done('a', '2026-10-19'), done('a', '2026-10-20')], '2026-10-21');
    assert.equal(open.currentStreak, 2);

    const missed = computeStreaks(habits, [done('a', '2026-10-19')], '2026-10-21');
    assert.equal(missed.currentStreak, 0);
    assert.equal(missed.longestStreak, 1);
  });

  test('a scheduled day with no rows at all breaks the streak', () => {
    const habits = [daily('a', '2026-10-18')];
    const s = computeStreaks(habits, [done('a', '2026-10-18'), done('a', '2026-10-20')], '2026-10-20');
    assert.equal(s.currentStreak, 1);
    assert.equal(s.longestStreak, 1);
  });

  test('broken then restarted: longest vs current', () => {
    const habits = [daily('a', '2026-10-10')];
    const completions = [...octDays(10, 14), ...octDays(16, 17)].map((d) => done('a', d));
    const s = computeStreaks(habits, completions, '2026-10-17');
    assert.equal(s.longestStreak, 5);
    assert.equal(s.currentStreak, 2);
  });

  test('per-habit current streaks (active habits only, today open)', () => {
    const habits = [daily('a', '2026-10-19'), daily('b', '2026-10-19'), daily('gone', '2026-10-19', true)];
    const completions = [
      done('a', '2026-10-19'), done('a', '2026-10-20'), // a: today (21st) still open
      done('b', '2026-10-21'), // b: missed the 19th and 20th, done today
      done('gone', '2026-10-21'),
    ];
    const s = computeStreaks(habits, completions, '2026-10-21');
    assert.deepEqual(s.perHabit, {a: 2, b: 1});
  });
});

describe('milestones and badges', () => {
  const run = (days: number) => {
    const dates = octDays(21 - days + 1, 21);
    return computeGamification([daily('a', dates[0])], dates.map((d) => done('a', d)), '2026-10-21');
  };

  test('no bonus at 2 days, exactly 25 at 3 days', () => {
    assert.equal(run(2).milestoneXp, 0);
    assert.deepEqual(run(2).badges, []);
    assert.equal(run(3).milestoneXp, 25);
    assert.deepEqual(run(3).badges, [3]);
  });

  test('25 at 6 days, exactly 25 + 50 at 7 days', () => {
    assert.equal(run(6).milestoneXp, 25);
    assert.equal(run(7).milestoneXp, 75);
    assert.deepEqual(run(7).badges, [3, 7]);
  });

  test('a milestone stays earned after the current streak breaks', () => {
    const habits = [daily('a', '2026-10-10')];
    const s = computeGamification(habits, octDays(10, 12).map((d) => done('a', d)), '2026-10-21');
    assert.equal(s.currentStreak, 0);
    assert.equal(s.milestoneXp, 25);
    assert.deepEqual(s.badges, [3]);
  });
});

describe('deleting a habit never lowers streaks, badges or milestone XP', () => {
  const habits = [
    daily('a', '2026-10-10'),
    onDays('b', ['mon', 'wed', 'fri'], '2026-10-10'),
    daily('c', '2026-10-14'),
  ];
  const completions = [
    ...octDays(10, 16).map((d) => done('a', d)),
    done('b', '2026-10-12'), done('b', '2026-10-14'),
    ...octDays(17, 20).map((d) => done('c', d)), // only c was completed on these days
    done('a', '2026-10-19', false),
  ];
  const today = '2026-10-21';
  const before = computeGamification(habits, completions, today);

  for (const victim of habits.map((h) => h.habitId)) {
    test(`deleting ${victim}`, () => {
      const after = computeGamification(
        habits.map((h) => (h.habitId === victim ? {...h, deleted: true} : h)), completions, today,
      );
      assert.ok(after.longestStreak >= before.longestStreak);
      assert.ok(after.currentStreak >= before.currentStreak);
      assert.ok(after.milestoneXp >= before.milestoneXp);
      assert.ok(after.badges.length >= before.badges.length);
      assert.equal(after.completionXp, before.completionXp);
    });
  }

  test('the only habit completed on recent days can be deleted without losing the streak', () => {
    const after = computeGamification(
      habits.map((h) => (h.habitId === 'c' ? {...h, deleted: true} : h)), completions, today,
    );
    assert.equal(before.longestStreak, 11); // Oct 10-20, today open
    assert.equal(after.longestStreak, 11);
    assert.equal(after.currentStreak, before.currentStreak);
    assert.deepEqual(after.badges, before.badges);
  });
});

describe('level', () => {
  const at = (xp: number) => {
    const l = levelFromXp(xp);
    return [l.level, l.xpIntoLevel, l.xpForNextLevel];
  };

  test('boundaries at 0, 49, 50, 149, 150, 299, 300, 499, 500 XP', () => {
    assert.deepEqual(at(0), [1, 0, 50]);
    assert.deepEqual(at(49), [1, 49, 50]);
    assert.deepEqual(at(50), [2, 0, 100]);
    assert.deepEqual(at(149), [2, 99, 100]);
    assert.deepEqual(at(150), [3, 0, 150]);
    assert.deepEqual(at(299), [3, 149, 150]);
    assert.deepEqual(at(300), [4, 0, 200]);
    assert.deepEqual(at(499), [4, 199, 200]);
    assert.deepEqual(at(500), [5, 0, 250]);
  });

  test('progress is a 0..1 fraction', () => {
    assert.equal(levelFromXp(49).progress, 0.98);
    assert.equal(levelFromXp(50).progress, 0);
  });

  test('every level boundary up to level 200 is exact', () => {
    for (let level = 1; level <= 200; level++) {
      const start = 25 * level * (level - 1);
      assert.equal(levelFromXp(start).level, level);
      if (start > 0) assert.equal(levelFromXp(start - 1).level, level - 1);
    }
  });
});

describe('diffStats', () => {
  const snap = (level: number, badges: number[], perfectDays: number) => ({level, badges, perfectDays});

  test('nothing changed', () => {
    assert.deepEqual(diffStats(snap(2, [3], 1), snap(2, [3], 1)),
      {levelUp: false, newLevel: 2, newBadges: [], perfectDay: false});
  });

  test('level up', () => {
    const e = diffStats(snap(1, [], 0), snap(2, [], 0));
    assert.equal(e.levelUp, true);
    assert.equal(e.newLevel, 2);
  });

  test('two badges unlocked by one tap', () => {
    assert.deepEqual(diffStats(snap(3, [3], 0), snap(3, [3, 7, 14], 0)).newBadges, [7, 14]);
  });

  test('a perfect day landing', () => {
    assert.equal(diffStats(snap(1, [], 2), snap(1, [], 3)).perfectDay, true);
  });

  test('un-checking gives no events', () => {
    assert.deepEqual(diffStats(snap(3, [3, 7], 4), snap(2, [3], 3)),
      {levelUp: false, newLevel: 2, newBadges: [], perfectDay: false});
  });

  test('from real snapshots: the tap that completes a third day', () => {
    const habits = [daily('a', '2026-10-19')];
    const twoDays = octDays(19, 20).map((d) => done('a', d));
    const before = computeGamification(habits, twoDays, '2026-10-21');
    const after = computeGamification(habits, [...twoDays, done('a', '2026-10-21')], '2026-10-21');
    assert.equal(after.totalXp - before.totalXp, 10 + 20 + 25); // completion + perfect day + 3-day milestone
    // 60 XP -> 115 XP: both inside level 2 (50..149)
    assert.deepEqual(diffStats(before, after), {levelUp: false, newLevel: 2, newBadges: [3], perfectDay: true});
  });
});

test('a malformed today throws', () => {
  assert.throws(() => computeGamification([], [], '2026-10-21T00:00:00Z'), /YYYY-MM-DD/);
  assert.throws(() => computeGamification([], [], ''), /YYYY-MM-DD/);
});
