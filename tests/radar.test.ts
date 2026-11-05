// The live radar (docs/PACKS_REPORTS_SPEC.md, section 11): area resolution, window scores, empty states, highlights,
// labels and their fit on small screens, the strings, and the on-device stores. Pure modules and injected storage.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {GamiCompletion} from '../utils/gamification.ts';
import type {PacksRecord} from '../utils/packs/record.ts';
import type {RadarHabit, RadarWindow} from '../utils/radar/score.ts';
import type {WeekdayKey} from '../constants/habits.ts';

const areas = await import('../utils/radar/areas.ts');
const score = await import('../utils/radar/score.ts');
const copy = await import('../utils/radar/copy.ts');
const {ICON_IDS} = await import('../constants/habits.ts');
const {AXES} = await import('../utils/onboarding/types.ts');
const {LABEL_SIZE, fitRadar} = await import('../utils/onboarding/radar.ts');
const {fitRadarTwoLine} = await import('../utils/radar/fit.ts');
const {textWidth} = await import('../utils/onboarding/layout.ts');
const {createAreasStore, parseAreas} = await import('../services/areasStoreCore.ts');
const {createOutlineStore, parseOutline} = await import('../services/profileOutlineStoreCore.ts');

// Today Monday 2026-11-02: the Week window is the 7 closed days Mon 26 Oct .. Sun 1 Nov
const TODAY = '2026-11-02';
const daily = (habitId: string, icon: string, createdDate: string, deleted = false): RadarHabit =>
  ({habitId, icon, createdDate, frequencyType: 'daily', days: [], deleted});
const onDays = (habitId: string, icon: string, days: WeekdayKey[], createdDate: string): RadarHabit =>
  ({habitId, icon, createdDate, frequencyType: 'weekdays', days, deleted: false});
const done = (habitId: string, date: string, completed = true): GamiCompletion => ({habitId, date, completed});
const oct = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
const WEEK = [26, 27, 28, 29, 30, 31].map(oct).concat('2026-11-01');

const builtin = (id: string, builtinId: string, habitIds: string[], order: number) =>
  ({id, kind: 'builtin', builtinId, name: id, habitIds, dropped: [], createdAt: 0, order});
const record = (packs: unknown[]): PacksRecord => ({version: 1, packs} as unknown as PacksRecord);

const axis = (w: RadarWindow, name: string) => w.axes.find((a) => a.axis === name)!;

describe('the worked example (Week)', () => {
  const habits = [
    daily('walk', 'run', oct(1)), daily('water', 'water', oct(1)),// Health
    daily('breathe', 'meditate', oct(1)),// Mind
    onDays('bed', 'star', ['mon', 'tue', 'wed', 'thu', 'fri'], oct(1)),// Discipline, Mon-Fri
    daily('focus', 'work', oct(29)),// Career, created Thursday
    onDays('read', 'book', ['sat'], '2026-11-01'),// Learning, created Sunday: no Saturday since
  ];
  const packs = record([
    builtin('p1', 'steady_energy', ['walk', 'water'], 0),
    builtin('p2', 'calm_mind', ['breathe'], 1),
    builtin('p3', 'daily_discipline', ['bed'], 2),
    builtin('p4', 'career_builder', ['focus'], 3),
    builtin('p5', 'study_sprint', ['read'], 4),
  ]);
  const completions = [
    ...WEEK.map((d) => done('walk', d)), ...WEEK.slice(0, 4).map((d) => done('water', d)),// 11 of 14
    ...WEEK.map((d) => done('breathe', d)), done('breathe', oct(25), false),// 7 of 7 (Oct 25 is outside)
    done('bed', oct(26)), done('bed', oct(27)), done('bed', oct(28)),// 3 of 5
    done('focus', oct(30)),// 1 of 4
    ...['walk', 'water', 'breathe', 'focus'].map((id) => done(id, TODAY)),// today never counts
  ];
  const radar = score.computeRadar({habits, completions, today: TODAY, packs, areas: {}});
  const week = radar.week;

  test('Health 11 of 14 = 79%', () => {
    assert.deepEqual(axis(week, 'Health'), {axis: 'Health', state: 'score', done: 11, scheduled: 14, share: 11 / 14, percent: 79});
  });
  test('Mind 7 of 7 = 100%', () => assert.equal((axis(week, 'Mind') as {percent: number}).percent, 100));
  test('Discipline 3 of 5 = 60%: the weekend is rest days, never a miss', () => {
    assert.deepEqual(axis(week, 'Discipline'), {axis: 'Discipline', state: 'score', done: 3, scheduled: 5, share: 0.6, percent: 60});
  });
  test('Career 1 of 4 = 25%: counted from its creation day', () => {
    assert.deepEqual(axis(week, 'Career'), {axis: 'Career', state: 'score', done: 1, scheduled: 4, share: 0.25, percent: 25});
  });
  test('Learning: no data (it has a habit, none scheduled in the window)', () => {
    assert.deepEqual(axis(week, 'Learning'), {axis: 'Learning', state: 'noData'});
  });
  test('Relations: empty (no habits)', () => assert.deepEqual(axis(week, 'Relations'), {axis: 'Relations', state: 'empty'}));

  test('axes come in the radar order, and the shape puts axes without a score at the centre', () => {
    assert.deepEqual(week.axes.map((a) => a.axis), [...AXES]);
    assert.deepEqual(score.radarShape(week), [0, 1, 0.25, 0.6, 0, 11 / 14]);
    assert.equal(week.starting, false);
  });

  test('labels and the six-row list', () => {
    assert.deepEqual(week.axes.map((a) => [copy.axisLabelLines(a).first, copy.axisLabelLines(a).second]), [
      ['Learning', '–'], ['Mind', '100%'], ['Career', '25%'], ['Discipline', '60%'], ['Relations', '–'], ['Health', '79%'],
    ]);
    assert.deepEqual(week.axes.map(copy.axisValue), ['No data', '100%', '25%', '60%', 'No habits here yet', '79%']);
    assert.deepEqual(week.axes.map(copy.axisDetail), [null, '7 of 7', '1 of 4', '3 of 5', null, '11 of 14']);
  });

  test('the accessibility sentence says every axis in words', () => {
    assert.equal(copy.radarA11yLabel('week', week.axes, week.starting),
      'Habit radar, last 7 days: Learning no data, Mind 100 percent, Career 25 percent, Discipline 60 percent, ' +
      'Relations no habits yet, Health 79 percent.');
  });

  test('Strongest Mind 100%, Needs care Career 25%', () => {
    const h = score.highlights(week);
    assert.equal(h.strongest?.axis, 'Mind');
    assert.equal(h.needsCare?.axis, 'Career');
    assert.equal(copy.strongestText('Mind', 100), 'Strongest: Mind 100%');
    assert.equal(copy.needsCareText('Career', 25), 'Needs care: Career 25%');
  });

  test('Month: the last 28 closed days', () => {
    // walk and water scheduled every day Oct 5 .. Nov 1 (28 each); done 7 + 4
    assert.deepEqual(axis(radar.month, 'Health'), {axis: 'Health', state: 'score', done: 11, scheduled: 56, share: 11 / 56, percent: 20});
  });
});

describe('window edges', () => {
  const h = [daily('a', 'run', '2026-09-01')];

  test('the 7th closed day is in, the 8th is out; the same at 28', () => {
    const w = score.computeRadar({habits: h, completions: [done('a', oct(26))], today: TODAY, packs: null, areas: {}});
    assert.equal((axis(w.week, 'Health') as {done: number}).done, 1);
    const out = score.computeRadar({habits: h, completions: [done('a', oct(25))], today: TODAY, packs: null, areas: {}});
    assert.equal((axis(out.week, 'Health') as {done: number}).done, 0);
    assert.equal((axis(out.month, 'Health') as {done: number}).done, 1);
    const m28 = score.computeRadar({habits: h, completions: [done('a', oct(5)), done('a', oct(4))], today: TODAY, packs: null, areas: {}});
    assert.equal((axis(m28.month, 'Health') as {done: number; scheduled: number}).done, 1);// Oct 5 in, Oct 4 out
    assert.equal((axis(m28.month, 'Health') as {scheduled: number}).scheduled, 28);
  });

  test('today never counts', () => {
    const w = score.computeRadar({habits: [daily('a', 'run', TODAY)], completions: [done('a', TODAY)], today: TODAY, packs: null, areas: {}});
    assert.equal(axis(w.week, 'Health').state, 'noData');
    assert.equal(w.week.starting, true);
  });

  test('a deleted habit is ignored (the perfect-day rule)', () => {
    const w = score.computeRadar({habits: [daily('gone', 'run', oct(1), true)], completions: [done('gone', oct(30))], today: TODAY, packs: null, areas: {}});
    assert.equal(axis(w.week, 'Health').state, 'empty');
  });

  test('all axes without a score: starting', () => {
    const none = score.computeRadar({habits: [], completions: [], today: TODAY, packs: null, areas: {}});
    assert.equal(none.week.starting, true);
    assert.ok(none.week.axes.every((a) => a.state === 'empty'));
    assert.equal(copy.radarA11yLabel('month', none.month.axes, true), 'Habit radar, last 28 days: Starts after your first full day.');
    assert.equal(copy.RADAR_STARTING, 'Starts after your first full day.');
  });
});

describe('area resolution', () => {
  const custom = (id: string, habitIds: string[], area?: string) =>
    ({id, kind: 'custom', name: id, habitIds, dropped: [], createdAt: 0, order: 9, ...(area ? {area} : {})});
  const packs = record([builtin('b', 'close_circle', ['inBuiltin'], 0), custom('c1', ['inCustom'], 'Career'), custom('c2', ['inBare'])]);
  const byPack = areas.packAreas(packs);
  const resolve = (habitId: string, icon: string, map: Record<string, string> = {}) =>
    areas.resolveArea({habitId, icon}, byPack, map as never);

  test('a built-in pack: its own area, whatever the icon or the stored map', () => {
    assert.equal(resolve('inBuiltin', 'run', {inBuiltin: 'Health'}), 'Relations');
  });
  test('a custom pack with an area: the pack wins over a stale map entry', () => {
    assert.equal(resolve('inCustom', 'book', {inCustom: 'Mind'}), 'Career');
  });
  test('a custom pack with no area: the stored value, else the icon', () => {
    assert.equal(resolve('inBare', 'book', {inBare: 'Discipline'}), 'Discipline');
    assert.equal(resolve('inBare', 'book'), 'Learning');
  });
  test('unpacked: stored area, stored Not counted, else the icon (a habit pulled onto a new phone)', () => {
    assert.equal(resolve('x', 'run', {x: 'Mind'}), 'Mind');
    assert.equal(resolve('x', 'run', {x: 'none'}), null);
    assert.equal(resolve('x', 'heart'), 'Relations');
    assert.equal(resolve('x', 'star'), null);
    assert.equal(resolve('x', 'unknown-icon'), null);
    assert.equal(resolve('x', 'run', {x: 'Nonsense'}), 'Health', 'an invalid stored value falls back to the icon');
  });

  test('the approved icon table, and every id in it is a real icon', () => {
    assert.deepEqual(areas.ICON_AREA, {
      run: 'Health', water: 'Health', food: 'Health', sleep: 'Health', meditate: 'Mind', music: 'Mind',
      work: 'Career', money: 'Career', book: 'Learning', study: 'Learning', heart: 'Relations',
    });
    for (const id of [...Object.keys(areas.ICON_AREA), 'star']) assert.ok((ICON_IDS as readonly string[]).includes(id), id);
    assert.equal(areas.iconArea('star'), 'none');
    assert.ok(!Object.values(areas.ICON_AREA).includes('Discipline'), 'Discipline has no icon of its own');
  });
});

describe('Strongest and Needs care', () => {
  const win = (shares: Record<string, number | null>): RadarWindow => ({
    window: 'week', starting: false,
    axes: AXES.map((a) => (shares[a] === undefined ? {axis: a, state: 'empty'} as const
      : shares[a] === null ? {axis: a, state: 'noData'} as const
        : {axis: a, state: 'score', done: 0, scheduled: 1, share: shares[a]!, percent: Math.round(shares[a]! * 100)} as const)),
  });

  test('one scored axis: only Strongest', () => {
    const h = score.highlights(win({Health: 0.2, Mind: null}));
    assert.equal(h.strongest?.axis, 'Health');
    assert.equal(h.needsCare, null);
  });
  test('the lowest at 75% or more: no Needs care', () => {
    assert.equal(score.highlights(win({Health: 0.9, Mind: 0.75})).needsCare, null);
    assert.equal(score.highlights(win({Health: 0.9, Mind: 0.74})).needsCare?.axis, 'Mind');
  });
  test('all equal: Strongest is the first in AXES order and Needs care is not shown', () => {
    const h = score.highlights(win({Health: 0.5, Mind: 0.5, Career: 0.5}));
    assert.equal(h.strongest?.axis, 'Mind');// AXES: Learning, Mind, Career, Discipline, Relations, Health
    assert.equal(h.needsCare, null);
  });
  test('ties go to the first axis in AXES order', () => {
    const h = score.highlights(win({Health: 0.9, Learning: 0.9, Career: 0.1, Relations: 0.1}));
    assert.equal(h.strongest?.axis, 'Learning');
    assert.equal(h.needsCare?.axis, 'Career');
  });
  test('nothing scored: neither', () => {
    assert.deepEqual(score.highlights(win({Health: null})), {strongest: null, needsCare: null});
  });
});

describe('labels fit the Summary radar on small screens', () => {
  // two lines: the area name, then the widest value "100%"
  const labels = AXES.map((a) => ({first: a, second: '100%'}));
  const fitAt = (screen: number) => fitRadarTwoLine(screen - 2 * 16, labels, (t) => textWidth(t, LABEL_SIZE));// Summary's side padding

  test('every two-line label is inside the drawing area at screen widths 300 to 430', () => {
    for (let screen = 300; screen <= 430; screen += 10) {
      const fit = fitAt(screen);
      assert.ok(fit.radius > 0, `radius ${fit.radius} at ${screen}`);
      for (const l of fit.labels) {
        assert.ok(l.left >= 0 && l.right <= fit.width, `${l.first} at ${screen}: ${l.left}..${l.right} of ${fit.width}`);
        assert.ok(l.top >= 0 && l.bottom <= fit.height, `${l.first} at ${screen}: ${l.top}..${l.bottom} of ${fit.height}`);
        assert.equal(l.secondY - l.firstY, 15, 'the value line sits under the name line');
      }
    }
  });

  test('measured radius: 57 at 300, 68 at 320, 91 at 360 (the Itel, pinned), 100 at 430', () => {
    assert.deepEqual([300, 320, 360, 430].map((s) => fitAt(s).radius), [57, 68, 91, 100]);
    assert.ok(fitAt(360).radius >= 91, 'the Itel keeps at least a 91 px radius');
  });

  test('labels grow away from the shape: above-centre ones stack upward, below-centre ones downward', () => {
    const fit = fitAt(360);
    fit.labels.forEach((l, i) => {
      const above = i === 0 || i === 1 || i === 5;// Learning (top), Mind, Health: the upper half
      if (above) assert.ok(l.bottom <= fit.cy, `${l.first} stays above the centre`);
      else assert.ok(l.top >= fit.cy, `${l.first} stays below the centre`);
    });
  });

  test('the onboarding fit is untouched: one-line labels still use fitRadar', () => {
    const one = fitRadar(328, [...AXES], (t) => textWidth(t, LABEL_SIZE));
    assert.equal(one.radius, 91);
    assert.equal(one.height, 2 * (91 + 12 + 2 + LABEL_SIZE + 4));
  });
});

describe('copy', () => {
  test('approved strings', () => {
    assert.equal(copy.RADAR_TITLE, 'Habit radar');
    assert.deepEqual(copy.WINDOW_CAPTION, {week: 'Last 7 days', month: 'Last 28 days'});
    assert.deepEqual(copy.WINDOW_LABEL, {week: 'Week', month: 'Month'});
    assert.equal(copy.NO_DATA, 'No data');
    assert.equal(copy.NO_HABITS_HERE, 'No habits here yet');
    assert.equal(copy.AREA_ROW_LABEL, 'AREA');
    assert.equal(copy.AREA_NOT_COUNTED, 'Not counted');
    assert.equal(copy.AREA_ROW_HELPER, "Used for your radar. Habits in a pack use the pack's area.");
    assert.equal(copy.RADAR_CARD_HINT, 'Opens Summary');
  });
});

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  let failRead = false;
  let failWrite = false;
  return {
    data,
    failReads(on: boolean) { failRead = on; },
    failWrites(on: boolean) { failWrite = on; },
    async getItem(key: string) {
      if (failRead) throw new Error('read');
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (failWrite) throw new Error('write');
      data.set(key, value);
    },
  };
}

describe('areas store (areas:v1:<uid>)', () => {
  test('per user, saved and read back from memory', async () => {
    const storage = memory();
    const store = createAreasStore(storage);
    assert.equal(await store.write('u1', 'h1', 'Mind'), true);
    assert.equal(await store.write('u1', 'h2', 'none'), true);
    assert.deepEqual(JSON.parse(storage.data.get('areas:v1:u1')!), {h1: 'Mind', h2: 'none'});
    assert.deepEqual(await store.read('u1'), {h1: 'Mind', h2: 'none'});
    assert.deepEqual(await store.read('u2'), {});
  });

  test('corrupt or unreadable reads as an empty map, never an error; bad entries are dropped', async () => {
    assert.deepEqual(parseAreas('{oops'), {});
    assert.deepEqual(parseAreas('[]'), {});
    assert.deepEqual(parseAreas(JSON.stringify({a: 'Mind', b: 'Nope', c: 3})), {a: 'Mind'});
    const storage = memory({'areas:v1:u1': JSON.stringify({a: 'Career'})});
    const store = createAreasStore(storage);
    storage.failReads(true);
    assert.deepEqual(await store.read('u1'), {});
    storage.failReads(false);
    assert.deepEqual(await store.read('u1'), {a: 'Career'}, 'retried, not remembered as empty');
  });

  test('a failed write resolves false and changes nothing', async () => {
    const storage = memory();
    const store = createAreasStore(storage);
    storage.failWrites(true);
    assert.equal(await store.write('u1', 'h1', 'Mind'), false);
    assert.deepEqual(await store.read('u1'), {});
  });

  test('two writes at once both land', async () => {
    const storage = memory();
    const store = createAreasStore(storage);
    await Promise.all([store.write('u1', 'a', 'Mind'), store.write('u1', 'b', 'Health')]);
    assert.deepEqual(JSON.parse(storage.data.get('areas:v1:u1')!), {a: 'Mind', b: 'Health'});
  });
});

describe('starting outline store (profile:outline:v1:<uid>)', () => {
  const scores = {Learning: 3, Mind: 2, Career: 5, Discipline: 1, Relations: 4, Health: 2};

  test('six whole numbers, clamped 1 to 5, per user', async () => {
    const storage = memory();
    const store = createOutlineStore(storage);
    await store.write('u1', {...scores, Career: 7, Discipline: 0.2, Mind: 2.6});
    assert.deepEqual(JSON.parse(storage.data.get('profile:outline:v1:u1')!), {...scores, Career: 5, Discipline: 1, Mind: 3});
    assert.deepEqual(await store.read('u1'), {...scores, Career: 5, Discipline: 1, Mind: 3});
    assert.equal(await store.read('u2'), null, 'nothing stored: nothing drawn');
  });

  test('missing axes or corrupt data read as no outline; a failed write is ignored', async () => {
    assert.equal(parseOutline('{oops'), null);
    assert.equal(parseOutline(JSON.stringify({Learning: 3})), null);
    const storage = memory();
    storage.failWrites(true);
    await createOutlineStore(storage).write('u1', scores);// resolves, never throws
    assert.equal(storage.data.size, 0);
  });
});
