// Vitality (docs/PACKS_REPORTS_SPEC.md, section 13) and the per-day completion counts it is built on. Pure modules.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {GamiCompletion, GamiHabit} from '../utils/gamification.ts';
import type {DayCount} from '../utils/dailyCompletion.ts';
import type {WeekdayKey} from '../constants/habits.ts';

const {dailyCompletion} = await import('../utils/dailyCompletion.ts');
const v = await import('../utils/vitality.ts');
const {countPerfectDays, computeStreaks} = await import('../utils/gamification.ts');

// 2026-11-02 is a Monday
const daily = (habitId: string, createdDate: string, deleted = false): GamiHabit =>
  ({habitId, createdDate, frequencyType: 'daily', days: [], deleted});
const onDays = (habitId: string, days: WeekdayKey[], createdDate: string): GamiHabit =>
  ({habitId, createdDate, frequencyType: 'weekdays', days, deleted: false});
const done = (habitId: string, date: string, completed = true): GamiCompletion => ({habitId, date, completed});
const eight = Array.from({length: 8}, (_, i) => daily(`h${i}`, '2026-11-02'));
const tick = (n: number, date: string) => eight.slice(0, n).map((h) => done(h.habitId, date));
const vitality = (habits: GamiHabit[], completions: GamiCompletion[], today: string) =>
  v.computeVitality(dailyCompletion(habits, completions, today));
const day = (scheduled: number, doneCount: number, date = '2026-11-02'): DayCount => ({date, scheduled, done: doneCount});
const shown = (x: ReturnType<typeof vitality>) => (x.state === 'ready' ? x.value : null);

describe('the worked example: 8 habits a day', () => {
  const table: [number, number][] = [[8, 6], [6, 4], [4, 1], [3, 0], [2, -1], [0, -4]];

  for (const [n, delta] of table) {
    test(`${n} done: ${delta >= 0 ? '+' : ''}${delta}, so the first closed day gives ${50 + delta}`, () => {
      assert.equal(v.dayDelta(n, 8), delta);
      // the whole pipeline: rows -> per-day counts -> Vitality, with today (Nov 3) open and nothing ticked
      const result = vitality(eight, tick(n, '2026-11-02'), '2026-11-03');
      assert.deepEqual(result, {state: 'ready', value: 50 + delta, closedValue: 50 + delta, band: v.vitalityBand(50 + delta)});
    });
  }

  test('the whole-number rounding matches Math.round (halves up) for every pair up to 50', () => {
    for (let scheduled = 1; scheduled <= 50; scheduled++) {
      for (let d = 0; d <= scheduled; d++) {
        assert.equal(v.dayDelta(d, scheduled), Math.round((10 * d) / scheduled) - 4, `${d}/${scheduled}`);
      }
    }
  });
});

describe('the closed-day history', () => {
  test('clamped at 100 after every day', () => {
    const ten = Array.from({length: 10}, (_, i) => day(8, 8, `2026-11-${String(2 + i).padStart(2, '0')}`));
    assert.equal(shown(v.computeVitality({closed: ten, today: null})), 100);
    assert.equal(shown(v.computeVitality({closed: [...ten, day(8, 0)], today: null})), 96);
  });

  test('clamped at 0 after every day', () => {
    const thirteen = Array.from({length: 13}, () => day(8, 0));
    assert.equal(shown(v.computeVitality({closed: thirteen, today: null})), 0);
    assert.equal(shown(v.computeVitality({closed: [...thirteen, day(8, 4)], today: null})), 1);
  });

  test('a rest day changes nothing', () => {
    const r = v.computeVitality({closed: [day(8, 8), day(0, 0), day(8, 6)], today: null});
    assert.equal(shown(r), 60);
  });

  test('a weekday habit off-day is a rest day', () => {
    const habits = [onDays('a', ['mon'], '2026-11-02')];
    const counts = dailyCompletion(habits, [done('a', '2026-11-02')], '2026-11-05');
    assert.deepEqual(counts.closed.map((d) => d.scheduled), [1, 0, 0]);// Mon, Tue, Wed
    assert.equal(shown(v.computeVitality(counts)), 56);
  });

  test('days the app was not opened count as 0 done', () => {
    // ticked Monday only; Tuesday and Wednesday have no rows at all
    assert.equal(shown(vitality(eight, tick(8, '2026-11-02'), '2026-11-05')), 56 - 4 - 4);
  });
});

describe('starting and today', () => {
  test('starting until a day with a scheduled habit has closed, even with a gain today', () => {
    assert.deepEqual(vitality([], [], '2026-11-02'), {state: 'starting'});
    assert.deepEqual(vitality(eight, tick(8, '2026-11-02'), '2026-11-02'), {state: 'starting'});
    // only rest days closed so far (a Friday habit created on Monday, today Thursday)
    assert.deepEqual(vitality([onDays('a', ['fri'], '2026-11-02')], [], '2026-11-05'), {state: 'starting'});
  });

  test("today's provisional gain shows; a provisional loss does not", () => {
    const closed = [day(8, 3)];// 50 + 0
    assert.deepEqual(v.computeVitality({closed, today: day(8, 8, 'today')}), {state: 'ready', value: 56, closedValue: 50, band: 'steady'});
    assert.deepEqual(v.computeVitality({closed, today: day(8, 0, 'today')}), {state: 'ready', value: 50, closedValue: 50, band: 'steady'});
    const top = Array.from({length: 9}, () => day(8, 8));
    assert.equal(shown(v.computeVitality({closed: top, today: day(8, 8, 'today')})), 100, 'still capped at 100');
  });

  test('at midnight the hidden loss becomes real', () => {
    const completions = tick(3, '2026-11-02');// Monday 3 of 8: 0
    // Tuesday open with nothing ticked: no loss shown
    assert.equal(shown(vitality(eight, completions, '2026-11-03')), 50);
    // Wednesday: Tuesday has closed with 0 of 8
    assert.equal(shown(vitality(eight, completions, '2026-11-04')), 46);
  });
});

describe('history edge cases (the perfect-day rule)', () => {
  test('a habit created mid-history counts from its creation day, not before', () => {
    const habits = [daily('a', '2026-11-02'), daily('b', '2026-11-03')];
    const counts = dailyCompletion(habits, [done('a', '2026-11-02'), done('a', '2026-11-03')], '2026-11-04');
    assert.deepEqual(counts.closed, [
      {date: '2026-11-02', scheduled: 1, done: 1},
      {date: '2026-11-03', scheduled: 2, done: 1},
    ]);
  });

  test('a deleted habit is gone from every day and agrees with perfect days', () => {
    const habits = [daily('a', '2026-11-02'), daily('gone', '2026-11-02', true)];
    const completions = [done('a', '2026-11-02'), done('gone', '2026-11-03')];
    const counts = dailyCompletion(habits, completions, '2026-11-04');
    assert.deepEqual(counts.closed.map((d) => [d.scheduled, d.done]), [[1, 1], [1, 0]]);
    const perfect = counts.closed.filter((d) => d.scheduled > 0 && d.done === d.scheduled).length;
    assert.equal(perfect, countPerfectDays(habits, completions, '2026-11-03'));
  });

  test('documented disagreement: a day kept alive for the streak only by a deleted habit scores 0 done', () => {
    const habits = [daily('a', '2026-11-02'), daily('gone', '2026-11-02', true)];
    const completions = [done('a', '2026-11-02'), done('gone', '2026-11-03')];
    assert.equal(computeStreaks(habits, completions, '2026-11-04').currentStreak, 2);// Mon and Tue count
    assert.equal(shown(vitality(habits, completions, '2026-11-04')), 56 - 4);// Tue: 0 of 1
  });

  test('completions dated after today are ignored', () => {
    const r = vitality(eight, [...tick(3, '2026-11-02'), ...tick(8, '2026-11-09')], '2026-11-03');
    assert.equal(shown(r), 50);
  });

  test('days are stepped by the calendar across daylight-saving dates', () => {
    for (const [from, to] of [['2026-03-27', '2026-03-31'], ['2026-10-23', '2026-10-27']]) {
      const counts = dailyCompletion([daily('a', from)], [], to);
      assert.equal(counts.closed.length, 4, `${from}..${to}`);
      assert.deepEqual(new Set(counts.closed.map((d) => d.date)).size, 4);
    }
  });

  test('all habits deleted: back to starting', () => {
    assert.deepEqual(vitality([daily('gone', '2026-11-02', true)], [done('gone', '2026-11-02')], '2026-11-05'), {state: 'starting'});
  });
});

describe('bands and strings', () => {
  test('under 25 low, 25 to 74 steady, 75 and over strong', () => {
    assert.deepEqual([24, 25, 74, 75].map(v.vitalityBand), ['low', 'steady', 'steady', 'strong']);
  });

  test('approved wording', () => {
    assert.equal(v.VITALITY_LABEL, 'Vitality');
    assert.equal(v.vitalityValueText(62), '62 / 100');
    assert.deepEqual(v.VITALITY_BAND_TEXT, {
      low: 'Low. Today is a fresh start.',
      steady: 'Steady. Keep the days ticking.',
      strong: "Strong. You're on a roll.",
    });
    assert.equal(v.VITALITY_STARTING, 'Starts after your first full day.');
    assert.equal(v.vitalityA11yLabel(62), 'Vitality 62 out of 100');
  });
});
