// F-1 (docs/PACKS_REPORTS_SPEC.md, sections 12 and 17): reflections in one item per year under
// reflections:v2:<uid>:<yyyy>, the marker reflections:migrated:v2:<uid>, and reflections:v1:<uid> read but never
// written. Migration, a kill in the middle of it, the rollback window, the year boundary, sizes, P-8 and fixtures,
// all through the real store core over an in-memory AsyncStorage (tests/helpers/kv-storage.ts).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';
import {fixture} from './helpers/fixtures.ts';
import type {Answers} from '../utils/reflections/questions.ts';

const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');
const R = await import('../utils/reflections/record.ts');

const UID = 'u1';
const V1 = R.reflectionsKey(UID);
const MARKER = R.reflectionsMarkerKey(UID);
const Y = (year: string) => R.reflectionsYearKey(UID, year);
const ANSWERS: Answers = {feel: 'ok', amount: 'all', helped: 'routine', blocker: 'none'};
const entry = (savedAt: number, extra: Record<string, unknown> = {}) => ({...ANSWERS, savedAt, ...extra});
const save = (habitId: string, date: string, savedAt: number, text = '') => ({habitId, date, answers: ANSWERS, text, savedAt});
const json = (m: {data: Map<string, string>}, key: string) => JSON.parse(m.data.get(key)!);
const habitsOn = (record: {days: Record<string, Record<string, unknown>>}, date: string) => Object.keys(record.days[date] ?? {}).sort();

// A v1 record across two years
const V1_TWO_YEARS = JSON.stringify({version: 1, days: {
  '2025-12-30': {a: entry(1)},
  '2026-01-02': {a: entry(2), b: entry(3, {text: 'words'})},
  '2026-11-05': {c: entry(4)},
}});

describe('F-1 migration: v1 is copied into year keys with the marker, in one multiSet, and never written', () => {
  test('first read: one multiSet of every year key and the marker; v1 byte-equal and never written', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    const view = await createReflectionsStore(m).read(UID);
    const sets = m.calls.filter((c) => c.op === 'multiSet' || c.op === 'setItem');
    assert.equal(sets.length, 1);
    assert.deepEqual([...sets[0].keys].sort(), [MARKER, Y('2025'), Y('2026')].sort());
    assert.equal(m.data.get(V1), V1_TWO_YEARS);
    assert.ok(!m.writes().includes(V1));
    assert.deepEqual(json(m, MARKER), {version: 1, years: [2025, 2026], v1Length: V1_TWO_YEARS.length});
    assert.deepEqual(Object.keys(json(m, Y('2025')).days), ['2025-12-30']);
    assert.deepEqual(Object.keys(json(m, Y('2026')).days).sort(), ['2026-01-02', '2026-11-05']);
    assert.deepEqual(view.days, JSON.parse(V1_TWO_YEARS).days);
  });

  test('a later app run reads the marker and v1, then every year in one multiGet, and writes nothing', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    await createReflectionsStore(m).read(UID);
    m.calls.length = 0;
    const view = await createReflectionsStore(m).read(UID);
    assert.deepEqual(m.calls.filter((c) => c.op === 'multiGet').map((c) => c.keys), [[MARKER], [Y('2025'), Y('2026')]]);
    assert.ok(!m.calls.some((c) => c.op === 'getAllKeys'));
    assert.deepEqual(m.writes(), []);
    assert.deepEqual(habitsOn(view, '2026-01-02'), ['a', 'b']);
  });

  test('a new account (no v1): the marker is written once, so later runs never list every key', async () => {
    const m = kvStorage();
    assert.deepEqual((await createReflectionsStore(m).read(UID)).days, {});
    assert.deepEqual(json(m, MARKER), {version: 1, years: [], v1Length: 0});
    m.calls.length = 0;
    await createReflectionsStore(m).read(UID);
    assert.ok(!m.calls.some((c) => c.op === 'getAllKeys'));
    assert.deepEqual(m.writes(), []);
  });

  test('fixture everythingCorrupt: a corrupt v1 copies nothing, gets a marker, and is left as it was', async () => {
    const f = fixture('everythingCorrupt');
    const m = kvStorage(f.storage);
    assert.deepEqual((await createReflectionsStore(m).read(f.uid)).days, {});
    assert.equal(m.data.get(R.reflectionsKey(f.uid)), f.storage[R.reflectionsKey(f.uid)]);
    assert.deepEqual(json(m, R.reflectionsMarkerKey(f.uid)).years, []);
  });

  test('fixture large: migrates into one key per year with every reflection, and each year item stays small', async () => {
    const f = fixture('large');
    const m = kvStorage(f.storage);
    const v1 = R.recordOf(R.parseReflections(f.storage[R.reflectionsKey(f.uid)]));
    const view = await createReflectionsStore(m).read(f.uid);
    assert.equal(R.toGamiReflections(view).length, R.toGamiReflections(v1).length);
    const years = json(m, R.reflectionsMarkerKey(f.uid)).years as number[];
    assert.ok(years.length >= 3);
    for (const y of years) assert.ok(Buffer.byteLength(m.data.get(R.reflectionsYearKey(f.uid, String(y)))!) < 250_000, `${y}`);
  });

  test('keys of another uid that starts the same are never read (u1 and u10)', async () => {
    const m = kvStorage({'reflections:v2:u10:2026': JSON.stringify({version: 1, days: {'2026-11-05': {x: entry(1)}}})});
    assert.deepEqual((await createReflectionsStore(m).read(UID)).days, {});
    assert.deepEqual(json(m, MARKER).years, []);
  });
});

describe('F-1 kill mid-migration: nothing is lost or duplicated', () => {
  test('the multiSet fails (Android: all or nothing): the read still has v1, nothing is remembered, the next run migrates', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    m.failWrites([MARKER]);
    const store = createReflectionsStore(m);
    const view = await store.read(UID);
    assert.deepEqual(view.days, JSON.parse(V1_TWO_YEARS).days, 'served from v1 although the write failed');
    assert.deepEqual([...m.data.keys()], [V1]);
    m.failWrites([MARKER], false);
    await store.read(UID);// not remembered: tried again
    assert.deepEqual(json(m, MARKER).years, [2025, 2026]);
    assert.deepEqual(json(m, Y('2026')).days, {'2026-01-02': JSON.parse(V1_TWO_YEARS).days['2026-01-02'], '2026-11-05': JSON.parse(V1_TWO_YEARS).days['2026-11-05']});
  });

  test('iOS-like: the year items landed but the marker did not; the next run merges again by union, no duplicates', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    m.setPartialMultiSet(true);
    m.failWrites([MARKER]);
    await createReflectionsStore(m).read(UID);
    assert.ok(m.data.has(Y('2025')) && m.data.has(Y('2026')) && !m.data.has(MARKER));
    // a reflection saved into 2026 by a build that then died before the marker: it must survive the re-merge
    const y2026 = json(m, Y('2026'));
    y2026.days['2026-11-06'] = {d: entry(9)};
    m.data.set(Y('2026'), JSON.stringify(y2026));
    m.failWrites([MARKER], false);
    const view = await createReflectionsStore(m).read(UID);
    assert.deepEqual(habitsOn(view, '2026-11-06'), ['d']);
    assert.deepEqual(habitsOn(view, '2026-01-02'), ['a', 'b']);
    assert.equal(R.toGamiReflections(view).length, 5);
    assert.deepEqual(json(m, MARKER).years, [2025, 2026]);
  });

  test('a year the marker lists is missing: it is filled again from v1', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    await createReflectionsStore(m).read(UID);
    m.data.delete(Y('2025'));
    const view = await createReflectionsStore(m).read(UID);
    assert.deepEqual(habitsOn(view, '2025-12-30'), ['a']);
    assert.ok(m.data.has(Y('2025')));
  });

  test('a save after a failed migration write carries the owed writes with it', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    m.failWrites([MARKER]);
    const store = createReflectionsStore(m);
    await store.read(UID);
    m.failWrites([MARKER], false);
    assert.equal(await store.save(UID, save('z', '2026-11-05', 10)), 'saved');
    assert.deepEqual(json(m, MARKER).years, [2025, 2026]);
    assert.deepEqual(Object.keys(json(m, Y('2025')).days), ['2025-12-30']);
    assert.deepEqual(habitsOn(json(m, Y('2026')), '2026-11-05'), ['c', 'z']);
  });
});

describe('F-1 rollback window: what an older build saves to v1 is merged in on the next run', () => {
  test('new entries come in; a habit and day the year already has keeps the year\'s entry; v1 is never written', async () => {
    const m = kvStorage({[V1]: V1_TWO_YEARS});
    const store = createReflectionsStore(m);
    await store.read(UID);
    assert.equal(await store.save(UID, save('e', '2026-11-06', 20, 'saved by F-1')), 'saved');
    // the older build reads v1 (it can't see e), and saves e again plus f
    const old = JSON.parse(m.data.get(V1)!);
    old.days['2026-11-06'] = {e: entry(30, {text: 'saved by the older build'})};
    old.days['2026-11-07'] = {f: entry(31)};
    const v1After = JSON.stringify(old);
    m.data.set(V1, v1After);
    m.calls.length = 0;
    const view = await createReflectionsStore(m).read(UID);
    assert.equal(view.days['2026-11-06'].e.text, 'saved by F-1');
    assert.deepEqual(habitsOn(view, '2026-11-07'), ['f']);
    assert.equal(m.data.get(V1), v1After);
    assert.ok(!m.writes().includes(V1));
    assert.equal(json(m, MARKER).v1Length, v1After.length);
    m.calls.length = 0;
    await createReflectionsStore(m).read(UID);
    assert.deepEqual(m.writes(), [], 'merged once');
  });

  test('a v1 that can\'t be read: rejects before migration; once a valid marker exists it is skipped', async () => {
    const before = kvStorage({[V1]: V1_TWO_YEARS});
    before.failReads([V1]);
    await assert.rejects(createReflectionsStore(before).read(UID), /CursorWindow/);
    assert.deepEqual(before.writes(), []);

    const after = kvStorage({[V1]: V1_TWO_YEARS});
    await createReflectionsStore(after).read(UID);
    after.failReads([V1]);
    after.data.delete(Y('2025'));// even with a year missing, nothing is rewritten without v1 to repair from
    after.calls.length = 0;
    const view = await createReflectionsStore(after).read(UID);
    assert.deepEqual(habitsOn(view, '2026-01-02'), ['a', 'b']);
    assert.deepEqual(after.writes(), []);
    assert.deepEqual(json(after, MARKER).years, [2025, 2026]);
  });
});

describe('F-1 failed reads reject and are retried', () => {
  for (const [name, key] of [['the marker', MARKER], ['a year', Y('2026')]] as const) {
    test(`${name} can't be read: the read rejects, nothing is written, and a retry works`, async () => {
      const m = kvStorage({[V1]: V1_TWO_YEARS});
      await createReflectionsStore(m).read(UID);
      const store = createReflectionsStore(m);
      m.failReads([key]);
      m.calls.length = 0;
      await assert.rejects(store.read(UID), /CursorWindow/);
      assert.equal(await store.save(UID, save('q', '2026-11-05', 50)), 'failed');
      assert.deepEqual(m.writes(), []);
      m.failReads([key], false);
      assert.deepEqual(habitsOn(await store.read(UID), '2026-11-05'), ['c']);
    });
  }
});

describe('F-1 year boundary', () => {
  test('31 December and 1 January go to two keys; the marker gains the year in the same multiSet', async () => {
    const m = kvStorage();
    const store = createReflectionsStore(m);
    assert.equal(await store.save(UID, save('a', '2026-12-31', 1)), 'saved');
    m.calls.length = 0;
    assert.equal(await store.save(UID, save('a', '2027-01-01', 2)), 'saved');
    assert.deepEqual(m.calls.map((c) => [c.op, [...c.keys].sort()]), [['multiSet', [MARKER, Y('2027')].sort()]]);
    assert.deepEqual(json(m, MARKER).years, [2026, 2027]);
    assert.deepEqual(Object.keys(json(m, Y('2026')).days), ['2026-12-31']);
    assert.deepEqual(Object.keys(json(m, Y('2027')).days), ['2027-01-01']);
    // the same reflections reach XP as from one record
    const one = R.addReflection(R.addReflection(R.emptyRecord(), save('a', '2026-12-31', 1))!, save('a', '2027-01-01', 2))!;
    const view = await createReflectionsStore(m).read(UID);
    assert.deepEqual(R.toGamiReflections(view), R.toGamiReflections(one));
  });

  test('a date from a phone whose clock was wrong (2019) gets its own key and is read back', async () => {
    const m = kvStorage();
    assert.equal(await createReflectionsStore(m).save(UID, save('a', '2019-03-04', 1)), 'saved');
    assert.deepEqual(json(m, MARKER).years, [2019]);
    assert.deepEqual(habitsOn(await createReflectionsStore(m).read(UID), '2019-03-04'), ['a']);
  });
});

describe('F-1 sizes (UTF-8 bytes; Android reads at most about 2 MB per item, 6 MB in all by default)', () => {
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
  const ids = (n: number) => Array.from({length: n}, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
  function build(habits: number, days: number, perDay: number, text: number) {
    const habitIds = ids(habits);
    const out: Record<string, Record<string, unknown>> = {};
    const start = Date.UTC(2025, 10, 14);
    for (let d = 0; d < days; d++) {
      const date = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
      const day: Record<string, unknown> = {};
      for (let k = 0; k < perDay; k++) day[habitIds[(d + k) % habits]] = entry(1_762_000_000_000 + (d * perDay + k) * 61_000, text ? {text: 'x'.repeat(text)} : {});
      out[date] = day;
    }
    const v1 = JSON.stringify({version: 1, days: out});
    const years = [...R.splitByYear(R.recordOf(R.parseReflections(v1))).values()].map((r) => bytes(R.serialiseReflections(r)));
    return {v1: bytes(v1), largest: Math.max(...years), total: years.reduce((a, b) => a + b, 0)};
  }

  test('the realistic rate (about 3 a day through the bar, 200-character text): each year item under 0.5 MB', () => {
    const r = build(16, 365, 3, 200);
    assert.ok(r.largest < 500_000, `${r.largest}`);
    assert.ok(r.v1 + r.total < 1_000_000, 'both copies (v1 kept) under 1 MB');
  });

  test('pinned limitation (accepted 2026-11-13): 20 a day with text for 2 years passes the per-item and total limits', () => {
    const r = build(300, 730, 20, 200);
    assert.ok(r.largest > 2_000_000, `largest year ${r.largest}`);
    assert.ok(r.v1 + r.total > 6 * 1024 * 1024, 'with v1 kept, past the 6 MB default');
  });
});

describe('F-1 and P-8: unknown fields and unreadable entries survive migration and per-year saves', () => {
  const NEWER = JSON.stringify({
    version: 1, futureTop: 'stays in v1',
    days: {
      '2026-11-05': {a: entry(1, {mood: 'bright'}), b: {...ANSWERS, feel: 'meh', savedAt: 2}},
      someday: [1, 2],
    },
  });

  test('entry keys and unreadable entries move to their year; the record\'s own keys and non-dates stay in v1 only', async () => {
    const m = kvStorage({[V1]: NEWER});
    const store = createReflectionsStore(m);
    const view = await store.read(UID);
    const year = json(m, Y('2026'));
    assert.deepEqual(year.days['2026-11-05'].a, entry(1, {mood: 'bright'}));
    assert.deepEqual(year.days['2026-11-05'].b, JSON.parse(NEWER).days['2026-11-05'].b);
    assert.equal('futureTop' in year, false);
    assert.equal('someday' in year.days, false);
    assert.equal(m.data.get(V1), NEWER);
    // the unreadable entry still counts as reflected and earns nothing
    assert.equal(R.hasReflection(view, 'b', '2026-11-05'), true);
    assert.deepEqual(R.toGamiReflections(view).map((r) => r.habitId), ['a']);
    assert.equal(await store.save(UID, save('b', '2026-11-05', 9)), 'exists');
    // a per-year save keeps both
    assert.equal(await store.save(UID, save('c', '2026-11-05', 10)), 'saved');
    const after = json(m, Y('2026'));
    assert.deepEqual(after.days['2026-11-05'].a, entry(1, {mood: 'bright'}));
    assert.deepEqual(after.days['2026-11-05'].b, JSON.parse(NEWER).days['2026-11-05'].b);
    assert.deepEqual(Object.keys(after.days['2026-11-05']).sort(), ['a', 'b', 'c']);
  });

  test('a year item\'s own unknown keys and the marker\'s survive a save that adds another year', async () => {
    const m = kvStorage({
      [MARKER]: JSON.stringify({version: 1, years: [2026], v1Length: 0, newer: {x: 1}}),
      [Y('2026')]: JSON.stringify({version: 1, futureTop: 'kept', days: {'2026-11-05': {a: entry(1)}}}),
    });
    const store = createReflectionsStore(m);
    assert.equal(await store.save(UID, save('a', '2026-11-06', 2)), 'saved');
    assert.equal(await store.save(UID, save('a', '2027-01-01', 3)), 'saved');
    assert.equal(json(m, Y('2026')).futureTop, 'kept');
    assert.deepEqual(json(m, MARKER), {newer: {x: 1}, version: 1, years: [2026, 2027], v1Length: 0});
  });
});
