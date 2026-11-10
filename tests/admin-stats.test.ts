// The admin Stats screen's pure parts: utils/adminStats.ts (trends ending yesterday, today's tiles, gaps, the
// test-account switch, snapshots, active-account completion, percentages, words, copy) and
// components/charts/geometry.ts (paths with gaps, a dot per point, bars, taps, donut arcs).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {StatsDoc, StatsSection} from '../utils/adminStats.ts';

const s = await import('../utils/adminStats.ts');
const g = await import('../components/charts/geometry.ts');

const HOUR = 3600 * 1000;
// Tue 10 Nov 2026, 10:00 Nairobi (07:00 UTC). Yesterday is Mon 9 Nov; a 7-day trend is 3..9 Nov.
const NOW = Date.UTC(2026, 10, 10, 7);
const WEEK = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'];

function section(n: number, extra: Partial<StatsSection> = {}): StatsSection {
  return {
    accounts: 10 + n,
    activeUsers: {openedDay: n, openedWeek: n + 1, loggedDay: n * 2, loggedWeek: n * 2 + 1},
    signups: {day: 1, perWeek: [{weekStart: '2026-11-02', count: n}, {weekStart: '2026-11-09', count: n + 1}]},
    completion: {scheduled: 8, done: 1},// every account: deliberately different, the chart must not use it
    completionActive: {scheduled: 4, done: n % 5, accounts: n},
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

  test('rangeDates ends on the date given, oldest first, across a month and a year end', () => {
    assert.deepEqual(s.rangeDates('2026-11-09', 7), WEEK);
    for (const days of s.RANGES) assert.equal(s.rangeDates('2026-11-10', days).length, days);
    assert.equal(s.rangeDates('2026-01-02', 3)[0], '2025-12-31');
    assert.equal(s.rangeDates('2028-03-01', 2)[0], '2028-02-29');
    assert.equal(s.addDaysTo('2026-03-01', -1), '2026-02-28');
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
  const docs = [
    doc('2026-11-10', 3, NOW - HOUR),// today
    doc('2026-11-08', 1, NOW - 30 * HOUR),
    doc('2026-11-01', 9, NOW - 9 * 24 * HOUR),
  ];

  test('trends end yesterday: today is never a point on a line or a bar', () => {
    for (const days of s.RANGES) {
      const v = s.buildStatsView(docs, {days, includeTest: false, nowMs: NOW});
      assert.equal(v.dates.length, days);
      assert.equal(v.dates.at(-1), '2026-11-09');
      assert.equal(v.dates.includes('2026-11-10'), false);
      for (const series of [v.opened, v.logged, v.completionPercent, v.aiCalls]) assert.equal(series.length, days);
    }
    assert.deepEqual(s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW}).dates, WEEK);
  });

  test('the tiles show today so far, from today\'s document only', () => {
    const v = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.today, {opened: 3, logged: 6});
    const noToday = s.buildStatsView(docs.slice(1), {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(noToday.today, {opened: null, logged: null});// yesterday's numbers are not shown as today's
    assert.equal(s.TODAY_CAPTION, 'Today so far');
  });

  test('missing days are gaps (null), never zeros', () => {
    const v = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.opened, [null, null, null, null, null, 1, null]);
    assert.deepEqual(v.logged, [null, null, null, null, null, 2, null]);
    assert.deepEqual(v.aiCalls, [null, null, null, null, null, 1, null]);
  });

  test('a value the server left out (old "opened" days) is a gap too, while the rest of that day shows', () => {
    const old = {...doc('2026-11-09', 4), real: section(4, {activeUsers: {loggedDay: 8}})};
    const v = s.buildStatsView([old], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.opened[6], null);
    assert.equal(v.logged[6], 8);
  });

  test('the test-account switch: off reads real, on reads all (trends and tiles)', () => {
    const off = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    const on = s.buildStatsView(docs, {days: 7, includeTest: true, nowMs: NOW});
    assert.equal(off.opened[5], 1);
    assert.equal(on.opened[5], 101);
    assert.equal(off.today.opened, 3);
    assert.equal(on.today.opened, 103);
  });

  test('a document missing the chosen section counts as missing', () => {
    const onlyAll: StatsDoc = {day: '2026-11-09', all: section(5), computedAtMs: null};
    const v = s.buildStatsView([onlyAll], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.hasAnyDoc, false);
    assert.equal(v.opened[6], null);
  });

  test('ranges: documents outside the range are ignored', () => {
    const week = s.buildStatsView(docs, {days: 7, includeTest: false, nowMs: NOW});
    const month = s.buildStatsView(docs, {days: 30, includeTest: false, nowMs: NOW});
    assert.equal(week.opened.filter((x) => x !== null).length, 1);// 1 Nov is outside the week, today is not a point
    assert.equal(month.opened.filter((x) => x !== null).length, 2);
    assert.equal(month.opened[month.dates.indexOf('2026-11-01')], 9);
    const future = s.buildStatsView([doc('2026-11-11', 7)], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(future.hasAnyDoc, false);
  });

  test('snapshot cards and "Updated" use the newest document, today\'s included', () => {
    const v = s.buildStatsView(docs, {days: 30, includeTest: false, nowMs: NOW});
    assert.deepEqual(v.signupWeeks, [{weekStart: '2026-11-02', count: 3}, {weekStart: '2026-11-09', count: 4}]);
    assert.equal(v.updatedAtMs, NOW - HOUR);
    assert.equal(v.areaTotal, 6);
    // without today's document: the newest day of the range
    const noToday = s.buildStatsView(docs.slice(1), {days: 30, includeTest: false, nowMs: NOW});
    assert.deepEqual(noToday.signupWeeks, [{weekStart: '2026-11-02', count: 1}, {weekStart: '2026-11-09', count: 2}]);
    assert.equal(noToday.updatedAtMs, NOW - 30 * HOUR);
  });

  test('completion charts the active accounts only; a version-1 document (no completionActive) is a gap', () => {
    const quiet = {...doc('2026-11-08', 2), real: section(2, {completionActive: {scheduled: 0, done: 0, accounts: 0}})};
    const v1 = {...doc('2026-11-07', 2), real: section(2, {completionActive: undefined})};
    const v = s.buildStatsView([doc('2026-11-09', 3), quiet, v1], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.completionPercent[6], 75);// active: 3 of 4 (all accounts would be 1 of 8)
    assert.equal(v.completionPercent[5], null);// nothing scheduled for active accounts
    assert.equal(v.completionPercent[4], null);// written before completionActive existed
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
    assert.deepEqual(v.today, {opened: null, logged: null});
    assert.equal(v.updatedAtMs, null);
    assert.equal(s.hasValues(v.completionPercent), false);
  });

  test('malformed documents read as gaps or zeros, never as numbers that are not there', () => {
    const junk: StatsDoc = {
      day: '2026-11-09', computedAtMs: null,
      real: {activeUsers: {openedDay: -1, loggedDay: 2.5}, signups: {perWeek: 'x'}, habits: {byArea: {Health: 'many'}},
        completionActive: {scheduled: 'four', done: 1}},
    };
    const v = s.buildStatsView([junk], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(v.opened[6], null);
    assert.equal(v.logged[6], null);
    assert.equal(v.completionPercent[6], null);
    assert.deepEqual(v.signupWeeks, []);
    assert.equal(v.areaTotal, 0);
    assert.ok(v.areas.every((a) => a.percent === 0));
  });
});

describe('numbers, words and copy', () => {
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

  test('singular and plural in every readout', () => {
    assert.equal(s.plural(1, 'request', 'requests'), '1 request');
    assert.equal(s.plural(0, 'request', 'requests'), '0 requests');
    assert.equal(s.plural(2, 'sign-up', 'sign-ups'), '2 sign-ups');
    assert.equal(s.barValueWords(1, 'sign-up', 'sign-ups'), '1 sign-up');
    assert.equal(s.barValueWords(null, 'sign-up', 'sign-ups'), 'no data');
    const one = s.buildStatsView([{day: '2026-11-09', computedAtMs: null, real: section(1, {
      signups: {perWeek: [{weekStart: '2026-11-09', count: 1}]},
      habits: {total: 1, byArea: {Health: 1}},
    })}], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(s.signupsLabel(one), 'Sign-ups per week, last 1 week: 1 sign-up in total, 1 on every day with data a week.');
    assert.equal(s.aiLabel(one, 7), 'AI insights per day, last 7 days: 1 request in total, 1 on every day with data a day.');
    assert.match(s.areasLabel(one), /, 1 habit: Health 1 \(100%\)\.$/);
  });

  test('accessibility summaries', () => {
    const v = s.buildStatsView([doc('2026-11-09', 14), doc('2026-11-08', 2)], {days: 30, includeTest: false, nowMs: NOW});
    assert.equal(s.activeUsersLabel(v, 30), 'Active users, last 30 days: opened the app from 2 to 14; logged a habit from 4 to 28.');
    assert.equal(s.completionLabel(v, 30), 'Completion rate, last 30 days, active accounts only, rebuilt from schedules: from 50% to 100%.');// 2 of 4, and 4 of 4
    assert.equal(s.aiLabel(v, 30), 'AI insights per day, last 30 days: 16 requests in total, from 2 to 14 a day.');
    assert.match(s.areasLabel(v), /^Habits by area, by habit icon, 6 habits: Learning 1 \(17%\)/);
    assert.match(s.signupsLabel(v), /^Sign-ups per week, last 2 weeks: 29 sign-ups in total/);
    const empty = s.buildStatsView([], {days: 7, includeTest: false, nowMs: NOW});
    assert.equal(s.activeUsersLabel(empty, 7), 'Active users, last 7 days: opened the app no data; logged a habit no data.');
    assert.equal(s.rangeWords([5, null, 5]), '5 on every day with data');
  });

  test('the locked copy', () => {
    assert.equal(s.COMPLETION_SUBTITLE, 'Active accounts only · rebuilt from schedules');
    assert.match(s.STATS_INFO.completion, /active = logged a habit in the last 7 days/);
    assert.match(s.STATS_INFO.areas, /Discipline is 0 here because no habit icon maps to it\. Areas chosen on the phone stay on the phone\.$/);
    assert.match(s.STATS_INFO.active, /starts on the day stats were first deployed/);
  });

  test('the copy obeys the same isolation rules as the admin screens (no on-device feature named)', () => {
    const copy = [...Object.values(s.STATS_INFO), s.COMPLETION_SUBTITLE, s.TODAY_CAPTION].join('\n');
    assert.doesNotMatch(copy, /\bpacks?\b|reflection|vitality|onboarding|radar|outline/i);
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

  test('linePath breaks at gaps and gives every point a dot', () => {
    const {d, dots} = g.linePath([1, 2, null, 4, null], 4, box);
    assert.equal(d, 'M0,37.5 L25,25 M75,0');
    assert.deepEqual(dots, [{x: 0, y: 37.5}, {x: 25, y: 25}, {x: 75, y: 0}]);
    assert.deepEqual(g.linePath([null, null], 4, box), {d: '', dots: []});
    assert.equal(g.linePath([2], 4, box).dots.length, 1);// one point in the middle
  });

  test('dotsPath: one tiny segment per dot, all in one path; no dots, no path', () => {
    assert.equal(g.dotsPath([{x: 0, y: 37.5}, {x: 75, y: 0}]), 'M0,37.5 h0.01 M75,0 h0.01');
    assert.equal(g.dotsPath([]), '');
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
