// The admin Stats screen's pure parts: utils/adminStats.ts (range, gaps, the test-account switch, snapshots,
// percentages, words) and components/charts/geometry.ts (paths with gaps, bars, taps, donut arcs).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {StatsDoc, StatsSection} from '../utils/adminStats.ts';

const s = await import('../utils/adminStats.ts');
const g = await import('../components/charts/geometry.ts');

const HOUR = 3600 * 1000;
// Tue 10 Nov 2026, 10:00 Nairobi (07:00 UTC)
const NOW = Date.UTC(2026, 10, 10, 7);

function section(n: number, extra: Partial<StatsSection> = {}): StatsSection {
  return {
    accounts: 10 + n,
    activeUsers: {openedDay: n, openedWeek: n + 1, loggedDay: n * 2, loggedWeek: n * 2 + 1},
    signups: {day: 1, perWeek: [{weekStart: '2026-11-02', count: n}, {weekStart: '2026-11-09', count: n + 1}]},
    completion: {scheduled: 4, done: n % 5},
    habits: {
      total: 6,
      byArea: {Learning: 1, Mind: 1, Career: 1, Discipline: 0, Relations: 0, Health: 2, none: 1},
      source: {user: 4, ai_suggested: 2, other: 0},
      frequency: {daily: 5, weekdays: 1},
      withReminder: 2,
    },
    aiInsights: {modelCalls: n},
    ...extra,
  };
}

// real carries n, all carries n + 100, so a test can tell which section was read
const doc = (day: string, n: number, computedAtMs: number | null = null): StatsDoc =>
  ({day, real: section(n), all: section(n + 100), computedAtMs});

describe('dates', () => {
  test('today is the Nairobi date, also between 00:00 and 03:00 when UTC is still on the day before', () => {
    assert.equal(s.nairobiToday(NOW), '2026-11-10');
    assert.equal(s.nairobiToday(Date.UTC(2026, 10, 9, 22, 30)), '2026-11-10');// 01:30 Nairobi
    assert.equal(s.nairobiToday(Date.UTC(2026, 10, 9, 20, 59)), '2026-11-09');// 23:59 Nairobi
  });

  test('ranges end today, oldest first, across a month and a year end', () => {
    assert.deepEqual(s.rangeDates('2026-11-10', 7), ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    for (const days of s.RANGES) assert.equal(s.rangeDates('2026-11-10', days).length, days);
    assert.equal(s.rangeDates('2026-01-02', 3)[0], '2025-12-31');
    assert.equal(s.rangeDates('2028-03-01', 2)[0], '2028-02-29');
  });

  test('labels', () => {
    assert.equal(s.shortDate('2026-11-09'), '9 Nov');
    assert.equal(s.dayLabel('2026-11-09'), 'Mon 9 Nov');
    assert.equal(s.relativeDayLabel('2026-11-10', '2026-11-10'), 'Today');
    assert.equal(s.relativeDayLabel('2026-11-09', '2026-11-10'), 'Yesterday');
    assert.equal(s.relativeDayLabel('2026-11-08', '2026-11-10'), 'Sun 8 Nov');
    assert.equal(s.shortDate('junk'), 'junk');
  });

  test('the default range is 30 days', () => {
    assert.equal(s.DEFAULT_RANGE, 30);
    assert.deepEqual([...s.RANGES], [7, 30, 90]);
  });
});

describe('buildStatsView', () => {
  const docs = [doc('2026-11-10', 3, NOW - HOUR), doc('2026-11-08', 1, NOW - 30 * HOUR), doc('2026-11-01', 9, NOW - 9 * 24 * HOUR)];

  test('missing days are gaps (null), never zeros', () => {
    const v = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.opened, [null, null, null, null, 1, null, 3]);
    assert.deepEqual(v.logged, [null, null, null, null, 2, null, 6]);
    assert.deepEqual(v.aiCalls, [null, null, null, null, 1, null, 3]);
  });

  test('a value the server left out (old "opened" days) is a gap too, while the rest of that day shows', () => {
    const old = {...doc('2026-11-09', 4), real: section(4, {activeUsers: {loggedDay: 8}})};
    const v = s.buildStatsView([old], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.opened[5], null);
    assert.equal(v.logged[5], 8);
  });

  test('the test-account switch: off reads real, on reads all', () => {
    const off = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    const on = s.buildStatsView(docs, {days: 7, includeTest: true, nowMs: NOW});
    assert.equal(off.opened[6], 3);
    assert.equal(on.opened[6], 103);
    assert.equal(off.latestActive?.opened, 3);
    assert.equal(on.latestActive?.opened, 103);
  });

  test('a document missing the chosen section counts as missing', () => {
    const onlyAll: StatsDoc = {day: '2026-11-10', all: section(5), computedAtMs: null};
    const v = s.buildStatsView([onlyAll], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.hasAnyDoc, false);
    assert.equal(v.opened[6], null);
  });

  test('ranges: documents outside the range are ignored', () => {
    const week = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    const month = s.buildStatsView(docs, {days: 30, includeTest: false, nowMs: NOW});
    assert.equal(week.dates.length, 7);
    assert.equal(month.dates.length, 30);
    assert.equal(week.opened.filter((x) => x !== null).length, 2);// 1 Nov is outside the week
    assert.equal(month.opened.filter((x) => x !== null).length, 3);
    assert.equal(month.opened[month.dates.indexOf('2026-11-01')], 9);
  });

  test('snapshot cards and "Updated" use the newest document in the range', () => {
    const v = s.buildStatsView(docs, {days: 30, includeTest: false, nowMs: NOW});
    assert.equal(v.latestActive?.day, '2026-11-10');
    assert.deepEqual(v.signupWeeks, [{weekStart: '2026-11-02', count: 3}, {weekStart: '2026-11-09', count: 4}]);
    assert.equal(v.updatedAtMs, NOW - HOUR);
    assert.equal(v.areaTotal, 6);
  });

  test('completion: whole percent of done over scheduled; nothing scheduled is a gap, not 0%', () => {
    const quiet = {...doc('2026-11-09', 2), real: section(2, {completion: {scheduled: 0, done: 0}})};
    const v = s.buildStatsView([doc('2026-11-10', 3), quiet], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.completionPercent[6], 75);// 3 of 4
    assert.equal(v.completionPercent[5], null);
    assert.equal(s.completionPercent(3, 0), 0);// scheduled, nothing done: a real 0%
    assert.equal(s.completionPercent(0, 0), null);// nothing scheduled: no data
    assert.equal(s.completionPercent(3, 1), 33);
    assert.equal(s.completionPercent(3, 2), 67);
    assert.equal(s.completionPercent(2, 5), 100);// done above scheduled is capped
    assert.equal(s.completionPercent('3', 1), null);
  });

  test('areas: all seven in order, Not counted last, percents add up to 100', () => {
    const v = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.areas.map((a) => a.label), ['Learning', 'Mind', 'Career', 'Discipline', 'Relations', 'Health', 'Not counted']);
    assert.deepEqual(v.areas.map((a) => a.count), [1, 1, 1, 0, 0, 2, 1]);
    assert.equal(v.areas.reduce((sum, a) => sum + a.percent, 0), 100);
    assert.deepEqual(v.areas.map((a) => a.percent), [17, 17, 17, 0, 0, 33, 16]);
  });

  test('habit setup: the three splits, with the without-reminder side derived from the total', () => {
    const v = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.setup?.frequency, {left: {label: 'Every day', count: 5, percent: 83}, right: {label: 'Some weekdays', count: 1, percent: 17}});
    assert.deepEqual(v.setup?.reminders, {left: {label: 'With reminder', count: 2, percent: 33}, right: {label: 'No reminder', count: 4, percent: 67}});
    assert.deepEqual(v.setup?.source, {left: {label: 'Added by user', count: 4, percent: 67}, right: {label: 'Suggested', count: 2, percent: 33}});
  });

  test('empty input: no gaps filled, snapshots empty, no crash', () => {
    const v = s.buildStatsView([], {days: 30, includeTest: true, nowMs: NOW});
    assert.equal(v.hasAnyDoc, false);
    assert.equal(v.dates.length, 30);
    assert.ok(v.opened.every((x) => x === null));
    assert.deepEqual(v.signupWeeks, []);
    assert.deepEqual(v.areas, []);
    assert.equal(v.setup, null);
    assert.equal(v.latestActive, null);
    assert.equal(v.updatedAtMs, null);
    assert.equal(s.hasValues(v.completionPercent), false);
  });

  test('malformed documents read as gaps or zeros, never as numbers that are not there', () => {
    const junk: StatsDoc = {
      day: '2026-11-10', computedAtMs: null,
      real: {activeUsers: {openedDay: -1, loggedDay: 2.5}, signups: {perWeek: 'x'}, habits: {byArea: {Health: 'many'}}},
    };
    const v = s.buildStatsView([junk], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.opened[6], null);
    assert.equal(v.logged[6], null);
    assert.deepEqual(v.signupWeeks, []);
    assert.equal(v.areaTotal, 0);
    assert.ok(v.areas.every((a) => a.percent === 0));
  });
});

describe('numbers and words', () => {
  test('sharePercents: largest remainder, adds up to 100, ties to the earlier item, zeros stay zero', () => {
    assert.deepEqual(s.sharePercents([1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(s.sharePercents([2, 1]), [67, 33]);
    assert.deepEqual(s.sharePercents([1, 0]), [100, 0]);
    assert.deepEqual(s.sharePercents([0, 0]), [0, 0]);
    assert.deepEqual(s.sharePercents([]), []);
    for (const counts of [[3, 3, 3, 3, 3, 3, 1], [7, 1, 1], [999, 1], [1, 2, 3, 4, 5, 6, 7]]) {
      assert.equal(s.sharePercents(counts).reduce((a, b) => a + b, 0), 100, String(counts));
    }
  });

  test('niceMax: at least 2, even below 10, then 1/2/5/10 steps', () => {
    assert.equal(s.niceMax(0), 2);
    assert.equal(s.niceMax(1), 2);
    assert.equal(s.niceMax(3), 4);
    assert.equal(s.niceMax(9), 10);
    assert.equal(s.niceMax(11), 20);
    assert.equal(s.niceMax(95), 100);
    assert.equal(s.niceMax(100), 100);
    assert.equal(s.niceMax(101), 200);
    assert.equal(s.niceMax(NaN), 2);
    for (const m of [2, 4, 6, 8, 10, 20, 50, 100, 200]) assert.equal(s.niceMax(m) % 2, 0);
  });

  test('accessibility summaries', () => {
    const v = s.buildStatsView([doc('2026-11-10', 14), doc('2026-11-09', 2)], {days: 30, includeTest: false, nowMs: NOW});
    assert.equal(s.activeUsersLabel(v, 30), 'Active users, last 30 days: opened the app from 2 to 14; logged a habit from 4 to 28.');
    assert.equal(s.completionLabel(v, 30), 'Completion rate, last 30 days, rebuilt from schedules: from 50% to 100%.');// 2 of 4, and 4 of 4
    assert.equal(s.aiLabel(v, 30), 'AI insights per day, last 30 days: 16 in total, from 2 to 14 a day.');
    assert.match(s.areasLabel(v), /^Habits by area, by habit icon, 6 habits: Learning 1 \(17%\)/);
    assert.match(s.signupsLabel(v), /^Sign-ups per week, last 2 weeks: 29 in total/);
    const empty = s.buildStatsView([], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(s.activeUsersLabel(empty, 7), 'Active users, last 7 days: opened the app no data; logged a habit no data.');
    assert.equal(s.rangeWords([5, null, 5]), '5 on every day with data');
  });

  test('refresh outcomes: the once-a-minute refusal, and everything else', () => {
    assert.equal(s.refreshOutcomeOf({code: 'functions/resource-exhausted'}), 'refused');
    assert.equal(s.refreshOutcomeOf({code: 'functions/unavailable'}), 'error');
    assert.equal(s.refreshOutcomeOf({code: 'functions/internal'}), 'error');
    assert.equal(s.refreshOutcomeOf(new Error('offline')), 'error');
    assert.equal(s.refreshOutcomeOf(null), 'error');
    assert.equal(s.REFRESH_MESSAGES.refused, 'Try again in a minute');
    assert.equal(s.REFRESH_MESSAGES.error, "Couldn't refresh. Showing the last saved numbers.");
  });

  test('clockTime is HH:MM', () => {
    assert.match(s.clockTime(NOW), /^\d{2}:\d{2}$/);
  });
});

describe('chart geometry', () => {
  const box = {width: 100, height: 50};

  test('linePath breaks at gaps and marks points that stand alone', () => {
    const {d, dots} = g.linePath([1, 2, null, 4, null], 4, box);
    assert.equal(d, 'M0,37.5 L25,25 M75,0');
    assert.deepEqual(dots, [{x: 75, y: 0}]);
    assert.deepEqual(g.linePath([null, null], 4, box), {d: '', dots: []});
    assert.equal(g.linePath([2], 4, box).dots.length, 1);// one point in the middle
  });

  test('values are clamped into the axis', () => {
    assert.equal(g.valueY(10, 4, 50), 0);
    assert.equal(g.valueY(-3, 4, 50), 50);
    assert.equal(g.valueY(1, 0, 50), 50);
  });

  test('barsPath: no bar for a gap or a zero, one sub-path per bar', () => {
    const d = g.barsPath([2, null, 0, 4], 4, box);
    assert.equal((d.match(/M/g) ?? []).length, 2);
    assert.equal(g.barsPath([null, 0], 4, box), '');
  });

  test('taps map to the nearest point or the bar slot, clamped', () => {
    assert.equal(g.nearestPoint(0, 5, 100), 0);
    assert.equal(g.nearestPoint(60, 5, 100), 2);
    assert.equal(g.nearestPoint(-20, 5, 100), 0);
    assert.equal(g.nearestPoint(500, 5, 100), 4);
    assert.equal(g.slotAt(24, 4, 100), 0);
    assert.equal(g.slotAt(26, 4, 100), 1);
    assert.equal(g.slotAt(100, 4, 100), 3);
    assert.equal(g.slotAt(10, 0, 100), 0);
  });

  test('axis ticks: first, middle, last', () => {
    assert.deepEqual(g.axisTicks(30), [0, 14, 29]);
    assert.deepEqual(g.axisTicks(2), [0, 1]);
    assert.deepEqual(g.axisTicks(0), []);
  });

  test('donut arcs skip empty slices and fill the circle; taps find the slice clockwise from 12 o\'clock', () => {
    const arcs = g.donutArcs([1, 0, 1, 2]);
    assert.deepEqual(arcs, [{index: 0, start: 0, length: 0.25}, {index: 2, start: 0.25, length: 0.25}, {index: 3, start: 0.5, length: 0.5}]);
    assert.deepEqual(g.donutArcs([0, 0]), []);
    // centre (50, 50), ring 30..45
    assert.equal(g.sliceAt(arcs, 60, 10, 50, 50, 30, 45), 0);// just right of 12 o'clock
    assert.equal(g.sliceAt(arcs, 90, 55, 50, 50, 30, 45), 2);// just below 3 o'clock
    assert.equal(g.sliceAt(arcs, 10, 50, 50, 50, 30, 45), 3);// 9 o'clock
    assert.equal(g.sliceAt(arcs, 50, 50, 50, 50, 30, 45), null);// the hole
  });
});
