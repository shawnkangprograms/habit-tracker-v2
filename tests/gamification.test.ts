// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import type {WeekdayKey} from '@/constants/habits';
import {
  computeGamification, computeStreaks, countPerfectDays, diffStats, isScheduledOn, levelFromXp, rewardedReflections,
  STREAK_MILESTONES, type GamiCompletion, type GamiHabit, type GamiReflection,
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
    assert.equal(s.reflectionXp, 0);
    assert.deepEqual([s.level, s.xpIntoLevel, s.xpForNextLevel, s.progress], [1, 0, 100, 0]);
  });

  test('one completion: 2 XP plus a 5 XP perfect day', () => {
    const s = computeGamification([daily('a', '2026-10-21')], [done('a', '2026-10-21')], '2026-10-21');
    assert.equal(s.completionXp, 2);
    assert.equal(s.perfectDays, 1);
    assert.equal(s.perfectDayXp, 5);
    assert.equal(s.totalXp, 7);
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
    assert.equal(s.completionXp, 10);
  });

  test('deleted habit keeps its XP but is ignored for perfect-day scheduling', () => {
    const habits = [daily('a', '2026-10-19'), daily('gone', '2026-10-19', true)];
    const completions = [
      done('a', '2026-10-19'), // perfect: the deleted habit isn't required
      done('gone', '2026-10-20'), // still earns 2 XP; a was missed, so not perfect
    ];
    const s = computeGamification(habits, completions, '2026-10-21');
    assert.equal(s.completionXp, 4);
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
    assert.equal(s.completionXp, 6);
    assert.equal(s.perfectDayXp, 15);
    assert.equal(s.milestoneXp, 5);
    assert.equal(s.totalXp, 26);
    assert.deepEqual([s.level, s.xpIntoLevel, s.xpForNextLevel, s.progress], [1, 26, 100, 0.26]);
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

  test('no bonus at 2 days, exactly 5 at 3 days', () => {
    assert.equal(run(2).milestoneXp, 0);
    assert.deepEqual(run(2).badges, []);
    assert.equal(run(3).milestoneXp, 5);
    assert.deepEqual(run(3).badges, [3]);
  });

  test('5 at 6 days, exactly 5 + 10 at 7 days', () => {
    assert.equal(run(6).milestoneXp, 5);
    assert.equal(run(7).milestoneXp, 15);
    assert.deepEqual(run(7).badges, [3, 7]);
  });

  test('a milestone stays earned after the current streak breaks', () => {
    const habits = [daily('a', '2026-10-10')];
    const s = computeGamification(habits, octDays(10, 12).map((d) => done('a', d)), '2026-10-21');
    assert.equal(s.currentStreak, 0);
    assert.equal(s.milestoneXp, 5);
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

  test('level n to n+1 costs 100n: boundaries at 0, 99, 100, 299, 300, 599, 600, 999, 1000 XP', () => {
    assert.deepEqual(at(0), [1, 0, 100]);
    assert.deepEqual(at(99), [1, 99, 100]);
    assert.deepEqual(at(100), [2, 0, 200]);
    assert.deepEqual(at(299), [2, 199, 200]);
    assert.deepEqual(at(300), [3, 0, 300]);
    assert.deepEqual(at(599), [3, 299, 300]);
    assert.deepEqual(at(600), [4, 0, 400]);
    assert.deepEqual(at(999), [4, 399, 400]);
    assert.deepEqual(at(1000), [5, 0, 500]);
  });

  test('the level table: total XP to reach levels 1 to 10', () => {
    const reach = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];
    reach.forEach((xp, i) => assert.equal(levelFromXp(xp).level, i + 1, `level ${i + 1} at ${xp}`));
  });

  test('progress is a 0..1 fraction', () => {
    assert.equal(levelFromXp(99).progress, 0.99);
    assert.equal(levelFromXp(100).progress, 0);
  });

  test('every level boundary up to level 200 is exact', () => {
    for (let level = 1; level <= 200; level++) {
      const start = 50 * level * (level - 1);
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
    assert.equal(after.totalXp - before.totalXp, 2 + 5 + 5); // completion + perfect day + 3-day milestone
    // 14 XP -> 26 XP: both inside level 1 (0..99)
    assert.deepEqual(diffStats(before, after), {levelUp: false, newLevel: 1, newBadges: [3], perfectDay: true});
  });
});

describe('milestone table (Stage 3: old XP divided by 5, rounded)', () => {
  test('days unchanged, XP 5, 10, 20, 40, 80, 160', () => {
    assert.deepEqual(STREAK_MILESTONES.map((m) => [m.days, m.xp]), [[3, 5], [7, 10], [14, 20], [30, 40], [60, 80], [100, 160]]);
    const old = [25, 50, 100, 200, 400, 800];
    STREAK_MILESTONES.forEach((m, i) => assert.equal(m.xp, Math.round(old[i] / 5)));
  });
});

describe('reflection XP', () => {
  const reflect = (habitId: string, date: string, savedAt: number): GamiReflection => ({habitId, date, savedAt});
  const ten = Array.from({length: 10}, (_, i) => daily(`h${i}`, '2026-10-19'));

  test('20 XP per reflection while that day\'s completion is ticked', () => {
    const habits = [daily('a', '2026-10-21'), daily('b', '2026-10-21')];
    const s = computeGamification(habits, [done('a', '2026-10-21')], '2026-10-21', [reflect('a', '2026-10-21', 1)]);
    assert.equal(s.reflectionXp, 20);
    assert.equal(s.totalXp, 2 + 20);
  });

  test('un-ticking removes the tick XP and that day\'s reflection XP; re-ticking restores both', () => {
    const habits = [daily('a', '2026-10-21'), daily('b', '2026-10-21')];
    const reflections = [reflect('a', '2026-10-21', 1)];
    const on = computeGamification(habits, [done('a', '2026-10-21')], '2026-10-21', reflections);
    const off = computeGamification(habits, [done('a', '2026-10-21', false)], '2026-10-21', reflections);
    assert.deepEqual([on.completionXp, on.reflectionXp, on.totalXp], [2, 20, 22]);
    assert.deepEqual([off.completionXp, off.reflectionXp, off.totalXp], [0, 0, 0]);
    // a reflection for another day doesn't pay on this day's tick
    const otherDay = computeGamification(habits, [done('a', '2026-10-21')], '2026-10-21', [reflect('a', '2026-10-20', 1)]);
    assert.equal(otherDay.reflectionXp, 0);
  });

  test('at most 3 rewarded a day: the earliest saved among those whose habit is ticked', () => {
    const completions = ten.map((h) => done(h.habitId, '2026-10-21'));
    const reflections = [reflect('h4', '2026-10-21', 40), reflect('h1', '2026-10-21', 10), reflect('h3', '2026-10-21', 30),
      reflect('h2', '2026-10-21', 20)];
    const paid = rewardedReflections(reflections, completions, '2026-10-21').map((r) => r.habitId).sort();
    assert.deepEqual(paid, ['h1', 'h2', 'h3']);
    assert.equal(computeGamification(ten, completions, '2026-10-21', reflections).reflectionXp, 60);
  });

  test('the cap holds through un-tick and re-tick: reflect, un-tick, reflect three others, re-tick', () => {
    const date = '2026-10-21';
    const reflections = [reflect('h0', date, 1), reflect('h1', date, 2), reflect('h2', date, 3), reflect('h3', date, 4)];
    const h0Off = [done('h0', date, false), ...['h1', 'h2', 'h3'].map((id) => done(id, date))];
    assert.equal(computeGamification(ten, h0Off, date, reflections).reflectionXp, 60);// h1, h2, h3
    const h0On = ['h0', 'h1', 'h2', 'h3'].map((id) => done(id, date));
    const paid = rewardedReflections(reflections, h0On, date).map((r) => r.habitId).sort();
    assert.deepEqual(paid, ['h0', 'h1', 'h2']);// still 3; h3 is now the unpaid one
    assert.equal(computeGamification(ten, h0On, date, reflections).reflectionXp, 60);
  });

  test('one per habit per day: a duplicate pays once', () => {
    const habits = [daily('a', '2026-10-21')];
    const s = computeGamification(habits, [done('a', '2026-10-21')], '2026-10-21',
      [reflect('a', '2026-10-21', 1), reflect('a', '2026-10-21', 2)]);
    assert.equal(s.reflectionXp, 20);
  });

  test('the cap is per day', () => {
    const completions = ['2026-10-20', '2026-10-21'].flatMap((d) => ten.map((h) => done(h.habitId, d)));
    const reflections = ['2026-10-20', '2026-10-21'].flatMap((d) => ['h0', 'h1', 'h2', 'h3'].map((id, i) => reflect(id, d, i)));
    assert.equal(computeGamification(ten, completions, '2026-10-21', reflections).reflectionXp, 120);
  });

  test('a deleted habit keeps its reflection XP; future dates are ignored', () => {
    const habits = [daily('gone', '2026-10-20', true)];
    const s = computeGamification(habits, [done('gone', '2026-10-20'), done('gone', '2026-10-22')], '2026-10-21',
      [reflect('gone', '2026-10-20', 1), reflect('gone', '2026-10-22', 2)]);
    assert.equal(s.reflectionXp, 20);
  });
});

describe('worked example (Stage 3 plan): a level-1 user with 10 daily habits', () => {
  const ten = Array.from({length: 10}, (_, i) => daily(`h${i}`, '2026-10-19'));
  const dayA = ten.slice(0, 6).map((h) => done(h.habitId, '2026-10-19'));// plain day: 6 of 10
  const dayB = ten.map((h) => done(h.habitId, '2026-10-20'));// perfect day
  const dayC = ten.map((h) => done(h.habitId, '2026-10-21'));// perfect day + 3 reflections + 3-day streak
  const reflectionsC: GamiReflection[] = ['h0', 'h1', 'h2'].map((id, i) => ({habitId: id, date: '2026-10-21', savedAt: i}));

  test('day A 12, day B 25, day C 90: level 2 with 27 of 200', () => {
    const a = computeGamification(ten, dayA, '2026-10-19');
    const b = computeGamification(ten, [...dayA, ...dayB], '2026-10-20');
    const c = computeGamification(ten, [...dayA, ...dayB, ...dayC], '2026-10-21', reflectionsC);
    assert.equal(a.totalXp, 12);
    assert.equal(b.totalXp - a.totalXp, 25);
    assert.equal(c.totalXp - b.totalXp, 20 + 5 + 60 + 5);
    assert.deepEqual([c.totalXp, c.level, c.xpIntoLevel, c.xpForNextLevel], [127, 2, 27, 200]);
  });

  test('a non-perfect day with 3 reflections is 72', () => {
    const six = ten.slice(0, 6).map((h) => done(h.habitId, '2026-10-19'));
    const s = computeGamification(ten, six, '2026-10-19', reflectionsC.map((r) => ({...r, date: '2026-10-19'})));
    assert.equal(s.totalXp, 72);
  });
});

describe('recalculating an existing account from history', () => {
  // The plan's example: 30 days (Oct 1-30), 8 daily habits, 192 ticks, 10 perfect days, longest streak 20.
  // All 8 on Oct 1-10, 6 on Oct 11-20, nothing on Oct 21 (the streak breaks), 6 on Oct 22-28, 5 on Oct 29-30.
  // No reflections: they didn't exist yet.
  const dates = Array.from({length: 30}, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const eight = Array.from({length: 8}, (_, i) => daily(`h${i}`, '2026-10-01'));
  const perDay = (i: number) => (i < 10 ? 8 : i < 20 ? 6 : i === 20 ? 0 : i < 28 ? 6 : 5);
  const completions = dates.flatMap((d, i) => eight.slice(0, perDay(i)).map((h) => done(h.habitId, d)));
  const today = '2026-10-30';

  test('the history: 192 ticks, 10 perfect days, longest streak 20', () => {
    const s = computeGamification(eight, completions, today);
    assert.equal(completions.length, 192);
    assert.equal(s.perfectDays, 10);
    assert.equal(s.longestStreak, 20);
  });

  test('level 10 on the old curve becomes level 3 (469 XP); recomputed, nothing stored', () => {
    // the old rules written out: 10 per tick, 20 per perfect day, 25 + 50 + 100, reaching level L at 25L(L-1)
    const oldXp = 192 * 10 + 10 * 20 + (25 + 50 + 100);
    let oldLevel = 1;
    while (25 * (oldLevel + 1) * oldLevel <= oldXp) oldLevel += 1;
    assert.deepEqual([oldXp, oldLevel], [2295, 10]);
    const s = computeGamification(eight, completions, today);
    assert.equal(s.totalXp, 192 * 2 + 10 * 5 + (5 + 10 + 20));
    assert.deepEqual([s.totalXp, s.level, s.xpIntoLevel, s.xpForNextLevel], [469, 3, 169, 300]);
  });
});

test('a malformed today throws', () => {
  assert.throws(() => computeGamification([], [], '2026-10-21T00:00:00Z'), /YYYY-MM-DD/);
  assert.throws(() => computeGamification([], [], ''), /YYYY-MM-DD/);
});
