// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {WeekdayKey} from '@/constants/habits';
import type {GamiCompletion} from '@/utils/gamification';
import type {SummaryHabit} from '@/utils/summary';

const {computeSummary} = await import('../utils/summary.ts');
const {computeStreaks, countPerfectDays} = await import('../utils/gamification.ts');

// Fixture dates: TODAY 2026-10-29 is a Thursday. Week = 10-23 (Fri) .. 10-29.
// Month = 09-30 (Wed) .. 10-29. Mondays: 10-05, 12, 19, 26. Saturdays: 10-03, 10, 17, 24.
const TODAY = '2026-10-29';

const daily = (habitId: string, createdDate: string, deleted = false, habitName = habitId): SummaryHabit =>
  ({habitId, habitName, icon: 'star', createdDate, frequencyType: 'daily', days: [], deleted});

const onDays = (habitId: string, days: WeekdayKey[], createdDate: string, habitName = habitId): SummaryHabit =>
  ({habitId, habitName, icon: 'star', createdDate, frequencyType: 'weekdays', days, deleted: false});

const done = (habitId: string, date: string, completed = true): GamiCompletion => ({habitId, date, completed});

const doneOn = (habitId: string, dates: string[], completed = true): GamiCompletion[] =>
  dates.map((date) => done(habitId, date, completed));

// Consecutive dates in October 2026, e.g. octDays(19, 21) -> 2026-10-19, 10-20, 10-21
const octDays = (from: number, to: number): string[] =>
  Array.from({length: to - from + 1}, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`);

const oct = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

describe('empty database', () => {
  test('zero counts, the "no habits" empty state, and full calendars', () => {
    const s = computeSummary([], [], TODAY);
    assert.equal(s.currentStreak, 0);
    for (const r of [s.week, s.month]) {
      assert.equal(r.empty, 'noHabits');
      assert.deepEqual([r.done, r.scheduled, r.rate, r.perfectDays, r.bestHabitId], [0, 0, null, 0, null]);
      assert.deepEqual(r.habits, []);
      assert.ok(r.days.every((d) => d.scheduled === 0 && d.share === null && !d.perfect));
      assert.equal(r.endDate, TODAY);
    }
    assert.equal(s.week.days.length, 7);
    assert.equal(s.week.startDate, oct(23));
    assert.equal(s.month.days.length, 30);
    assert.equal(s.month.startDate, '2026-09-30');
    assert.equal(s.month.leadingBlanks, 2, '09-30 is a Wednesday: Mon and Tue are blank');
    assert.equal(s.week.leadingBlanks, 4, '10-23 is a Friday');
  });

  test('a deleted habit alone counts as no habits', () => {
    const s = computeSummary([daily('gone', '2026-10-01', true)], doneOn('gone', octDays(1, 29)), TODAY);
    assert.equal(s.week.empty, 'noHabits');
    assert.equal(s.week.scheduled, 0);
  });
});

describe('habit created mid-range', () => {
  test('scheduled only from its created date', () => {
    const h = daily('a', oct(26));
    const s = computeSummary([h], doneOn('a', [oct(26), oct(28), oct(29)]), TODAY);
    assert.deepEqual(s.week.days.map((d) => d.scheduled), [0, 0, 0, 1, 1, 1, 1]);
    assert.deepEqual([s.week.done, s.week.scheduled, s.week.rate], [3, 4, 0.75]);
    assert.deepEqual([s.month.done, s.month.scheduled], [3, 4], 'the month adds no days before creation');
    assert.equal(s.week.empty, null);
  });
});

describe('weekday schedules', () => {
  test('unscheduled days are neither scheduled nor misses', () => {
    const h = onDays('mwf', ['mon', 'wed', 'fri'], oct(1));
    // a stale completed row on Saturday (e.g. from an old schedule) must not count
    const s = computeSummary([h], doneOn('mwf', [oct(23), oct(24), oct(28)]), TODAY);
    // week: Fri 23, Sat 24, Sun 25, Mon 26, Tue 27, Wed 28, Thu 29
    assert.deepEqual(s.week.days.map((d) => d.scheduled), [1, 0, 0, 1, 0, 1, 0]);
    assert.deepEqual(s.week.days.map((d) => d.done), [1, 0, 0, 0, 0, 1, 0]);
    assert.deepEqual(s.week.days.map((d) => d.share), [1, null, null, 0, null, 1, null]);
    assert.deepEqual([s.week.done, s.week.scheduled], [2, 3]);
    assert.equal(s.week.habits[0].rate, 2 / 3);
  });
});

describe('perfect days', () => {
  test('all scheduled done is perfect; one missing is not; matches countPerfectDays', () => {
    const habits = [daily('a', oct(20)), daily('b', oct(20))];
    const completions = [...doneOn('a', [oct(27), oct(28)]), done('b', oct(27)), done('b', oct(28), false)];
    const s = computeSummary(habits, completions, TODAY);
    assert.equal(s.week.days.find((d) => d.date === oct(27))!.perfect, true);
    assert.equal(s.week.days.find((d) => d.date === oct(28))!.perfect, false);
    assert.equal(s.week.perfectDays, 1);
    // the same rule as gamification: perfect days up to today minus those before the range
    const inRange = countPerfectDays(habits, completions, TODAY) - countPerfectDays(habits, completions, oct(22));
    assert.equal(s.week.perfectDays, inRange);
  });
});

describe('day with nothing scheduled', () => {
  test('a neutral day: no share, not perfect, left out of the rate, and the streak is not broken', () => {
    const h = onDays('sat', ['sat'], oct(1));
    const completions = doneOn('sat', [oct(17), oct(24)]); // 10-03 and 10-10 missed
    const s = computeSummary([h], completions, TODAY);
    const blank = s.week.days.filter((d) => d.date !== oct(24));
    assert.ok(blank.every((d) => d.scheduled === 0 && d.share === null && !d.perfect));
    assert.deepEqual([s.week.done, s.week.scheduled, s.week.rate, s.week.perfectDays], [1, 1, 1, 1]);
    assert.equal(s.currentStreak, 2, 'the empty days between Saturdays do not break it');
    assert.equal(s.currentStreak, computeStreaks([h], completions, TODAY).currentStreak);
  });

  test('habits exist but none is due in the range: the "nothing scheduled" empty state', () => {
    // created today, due only on Mondays: nothing due in the week; the month has no Monday after today either
    const s = computeSummary([onDays('mon', ['mon'], TODAY)], [], TODAY);
    assert.equal(s.week.empty, 'nothingScheduled');
    assert.equal(s.month.empty, 'nothingScheduled');
    assert.equal(s.week.habits.length, 1);
    assert.equal(s.week.habits[0].rate, null);
  });
});

describe('today is open', () => {
  test('an unfinished habit today is left out of the rate but shown in today\'s entry', () => {
    const s = computeSummary([daily('a', TODAY)], [done('a', TODAY, false)], TODAY);
    assert.deepEqual([s.week.done, s.week.scheduled, s.week.rate], [0, 0, null]);
    assert.equal(s.week.habits[0].rate, null);
    const today = s.week.days.at(-1)!;
    assert.deepEqual([today.isToday, today.scheduled, today.done, today.share, today.perfect], [true, 1, 0, 0, false]);
    assert.equal(s.week.empty, null, 'something is due today, so the range is shown');
  });

  test('a finished habit today counts in both done and scheduled', () => {
    const s = computeSummary([daily('a', TODAY)], [done('a', TODAY)], TODAY);
    assert.deepEqual([s.week.done, s.week.scheduled, s.week.rate, s.week.perfectDays], [1, 1, 1, 1]);
    assert.equal(s.week.days.at(-1)!.share, 1);
  });

  test('one of two done today: only the finished one counts; today shows 1 of 2', () => {
    const s = computeSummary([daily('a', TODAY), daily('b', TODAY)], [done('a', TODAY)], TODAY);
    assert.deepEqual([s.week.done, s.week.scheduled], [1, 1]);
    const today = s.week.days.at(-1)!;
    assert.deepEqual([today.scheduled, today.done, today.share, today.perfect], [2, 1, 0.5, false]);
    assert.deepEqual(s.week.habits.map((h) => [h.habitId, h.scheduled]), [['a', 1], ['b', 0]]);
  });
});

describe('Best this range', () => {
  // created 10-25: 5 counted days in the week when today is done
  test('a tie at the top among eligible habits means no marker', () => {
    const habits = [daily('a', oct(25)), daily('b', oct(25))];
    const s = computeSummary(habits, [...doneOn('a', [oct(25), oct(26), oct(27), oct(29)]),
      ...doneOn('b', [oct(25), oct(27), oct(28), oct(29)])], TODAY);
    assert.deepEqual(s.week.habits.map((h) => [h.done, h.scheduled]), [[4, 5], [4, 5]]);
    assert.equal(s.week.bestHabitId, null);
    assert.ok(s.week.habits.every((h) => !h.best));
  });

  test('equal rates with different counts are a tie (exact comparison)', () => {
    // a: 2 of 3 (created 10-27, today done); b: 4 of 6 (created 10-24, today done)
    const habits = [daily('a', oct(27)), daily('b', oct(24))];
    const s = computeSummary(habits, [...doneOn('a', [oct(27), oct(29)]),
      ...doneOn('b', [oct(24), oct(25), oct(26), oct(29)])], TODAY);
    assert.deepEqual(s.week.habits.map((h) => [h.habitId, h.done, h.scheduled]), [['b', 4, 6], ['a', 2, 3]],
      'same rate: more counted days first');
    assert.equal(s.week.bestHabitId, null);
  });

  test('a unique top gets the marker', () => {
    const habits = [daily('a', oct(25)), daily('b', oct(25))];
    const s = computeSummary(habits, [...doneOn('a', octDays(25, 29)), ...doneOn('b', octDays(26, 29))], TODAY);
    assert.equal(s.week.bestHabitId, 'a');
    assert.deepEqual(s.week.habits.map((h) => [h.habitId, h.best]), [['a', true], ['b', false]]);
  });

  test('a habit with fewer than 3 days neither wins nor blocks', () => {
    // c: 2 of 2 (100%), sorts first but is not eligible; a 4 of 5 beats b 3 of 5
    const habits = [daily('a', oct(25)), daily('b', oct(25)), daily('c', oct(28))];
    const s = computeSummary(habits, [
      ...doneOn('a', [oct(25), oct(26), oct(27), oct(29)]),
      ...doneOn('b', [oct(25), oct(26), oct(29)]),
      ...doneOn('c', [oct(28), oct(29)]),
    ], TODAY);
    assert.deepEqual(s.week.habits.map((h) => h.habitId), ['c', 'a', 'b']);
    assert.equal(s.week.bestHabitId, 'a');
    assert.equal(s.week.habits[0].best, false);
  });

  test('a top rate of 0 is no best', () => {
    const s = computeSummary([daily('a', oct(20))], [], TODAY);
    assert.equal(s.week.bestHabitId, null);
  });
});

describe('streak across the range boundary', () => {
  test('a run that started before the week shows in full, as computeStreaks gives it', () => {
    const h = daily('a', oct(10));
    const completions = doneOn('a', octDays(15, 28)); // 14 days; today still open
    const s = computeSummary([h], completions, TODAY);
    assert.equal(s.currentStreak, 14);
    assert.equal(s.currentStreak, computeStreaks([h], completions, TODAY).currentStreak);
    assert.equal(s.week.done, 6, 'the week itself only holds 6 of those days');
  });
});

describe('a month with 30 days of data', () => {
  test('daily, weekday and deleted habits together', () => {
    const habits = [
      daily('d', '2026-09-01', false, 'Daily'),
      onDays('w', ['mon', 'wed', 'fri'], '2026-09-01', 'Weekdays'),
      daily('x', '2026-09-01', true, 'Deleted'),
    ];
    const month = ['2026-09-30', ...octDays(1, 29)];
    const completions: GamiCompletion[] = [];
    for (const date of month) {
      const dayOfMonth = Number(date.slice(8));
      completions.push(done('d', date, dayOfMonth % 5 !== 0)); // missed 09-30, 10-05, 10, 15, 20, 25
      completions.push(done('w', date)); // a row every day; only Mon/Wed/Fri count
      completions.push(done('x', date));
    }
    const s = computeSummary(habits, completions, TODAY);

    const m = s.month;
    assert.equal(m.days.length, 30);
    assert.deepEqual([m.startDate, m.endDate, m.leadingBlanks], ['2026-09-30', TODAY, 2]);
    assert.deepEqual(m.days.map((d) => d.isToday), [...Array(29).fill(false), true]);
    // d: 30 days, 6 missed. w: 09-30 + 12 Mon/Wed/Fri in October = 13, all done. x is deleted.
    assert.deepEqual(m.habits.map((h) => [h.habitId, h.done, h.scheduled]), [['w', 13, 13], ['d', 24, 30]]);
    assert.deepEqual([m.done, m.scheduled], [37, 43]);
    assert.equal(m.perfectDays, 24, 'every day d was done');
    assert.equal(m.bestHabitId, 'w');

    const w = s.week; // 10-23 .. 10-29: d misses 10-25; w due Fri 23, Mon 26, Wed 28
    assert.deepEqual(w.habits.map((h) => [h.habitId, h.done, h.scheduled]), [['w', 3, 3], ['d', 6, 7]]);
    assert.deepEqual([w.done, w.scheduled, w.perfectDays, w.bestHabitId], [9, 10, 6, 'w']);
    assert.deepEqual(w.days.map((d) => d.scheduled), [2, 1, 1, 2, 1, 2, 1]);

    // the deleted habit's completions keep the streak alive through d's misses, as on Profile
    assert.equal(s.currentStreak, 30);
    assert.equal(s.currentStreak, computeStreaks(habits, completions, TODAY).currentStreak);
  });
});

describe('today comes only from the argument', () => {
  test('future-dated rows are ignored and a bad date is rejected', () => {
    const h = daily('a', oct(28));
    const s = computeSummary([h], doneOn('a', [oct(28), oct(30)]), TODAY);
    assert.deepEqual([s.week.done, s.week.scheduled], [1, 1]);
    assert.equal(s.week.days.at(-1)!.date, TODAY);
    // just after midnight in UTC+3 the UTC date is still the 28th; the caller passes the local date
    const yesterday = computeSummary([h], doneOn('a', [oct(28), oct(29)]), oct(28));
    assert.equal(yesterday.week.endDate, oct(28));
    assert.deepEqual([yesterday.week.done, yesterday.week.scheduled], [1, 1]);
    assert.throws(() => computeSummary([], [], '2026-10-29T00:00'), /local YYYY-MM-DD/);
  });
});
