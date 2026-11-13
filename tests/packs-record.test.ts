// The pack record and its mirror (utils/packs/record.ts) and the store (services/packsStoreCore.ts), with storage
// injected as a Map. docs/PACKS_REPORTS_SPEC.md, sections 2 and 7.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {PacksRecord} from '../utils/packs/record.ts';

const r = await import('../utils/packs/record.ts');
const {createPacksStore} = await import('../services/packsStoreCore.ts');

const TWO: PacksRecord = {
  version: 1,
  packs: [
    {id: 'calm_mind', kind: 'builtin', builtinId: 'calm_mind', name: 'Calm Mind', habitIds: ['h1', 'h2'], dropped: [], createdAt: 5, order: 1},
    {id: 'steady_energy', kind: 'builtin', builtinId: 'steady_energy', name: 'Steady Energy', habitIds: ['h3'], dropped: ['walk20'], createdAt: 5, order: 0},
  ],
};

describe('the record', () => {
  test('round-trips, sorted by order', () => {
    const parsed = r.parsePacks(r.serialisePacks(TWO));
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.deepEqual(parsed.record.packs.map((p) => p.id), ['steady_energy', 'calm_mind']);
    assert.deepEqual(parsed.record.packs[0].dropped, ['walk20']);
    assert.deepEqual(r.parsePacks(r.serialisePacks(parsed.record)), parsed);
  });

  test('missing is "none"; anything structurally wrong is "corrupt" (never repaired into something else)', () => {
    assert.deepEqual(r.parsePacks(null), {kind: 'none'});
    const pack = TWO.packs[0];
    const bad: unknown[] = [
      'x', '[]', '{}', {version: 2, packs: []}, {version: 1, packs: {}},
      {version: 1, packs: [{...pack, id: ''}]},
      {version: 1, packs: [{...pack, kind: 'other'}]},
      {version: 1, packs: [{...pack, builtinId: 'nope', id: 'nope'}]},
      {version: 1, packs: [{...pack, id: 'something_else'}]},// a built-in pack's id is its builtinId
      {version: 1, packs: [{...pack, name: ''}]},
      {version: 1, packs: [{...pack, name: ' Calm Mind'}]},// stored untrimmed
      {version: 1, packs: [{...pack, name: 'x'.repeat(25)}]},
      {version: 1, packs: [{...pack, habitIds: 'h1'}]},
      {version: 1, packs: [{...pack, createdAt: -1}]},
      {version: 1, packs: [{...pack, order: 'first'}]},
      {version: 1, packs: [{...pack, kind: 'custom'}]},// a custom pack has no builtinId
      {version: 1, packs: [pack, {...pack}]},// the same id twice
      {version: 1, packs: [pack, {...pack, id: 'c1', kind: 'custom', builtinId: undefined, name: 'calm mind'}]},// names ignore case
    ];
    for (const value of bad) {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      assert.deepEqual(r.parsePacks(raw), {kind: 'corrupt'}, raw);
    }
  });

  test('a habit in two packs stays in the first by order; repeats and non-strings are dropped', () => {
    const raw = JSON.stringify({version: 1, packs: [
      {...TWO.packs[0], habitIds: ['h1', 'h1', 7, 'h3']},
      {...TWO.packs[1], habitIds: ['h3', 'h4']},
    ]});
    const parsed = r.parsePacks(raw);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.deepEqual(parsed.record.packs.map((p) => [p.id, p.habitIds]), [['steady_energy', ['h3', 'h4']], ['calm_mind', ['h1']]]);
  });

  test('dropped keeps only that pack\'s own templates', () => {
    const raw = JSON.stringify({version: 1, packs: [{...TWO.packs[1], dropped: ['walk20', 'breathe5', 'nope', 'walk20']}]});
    const parsed = r.parsePacks(raw);
    assert.ok(parsed.kind === 'ok');
    assert.deepEqual(parsed.record.packs[0].dropped, ['walk20']);
  });

  test('serialising writes the known fields only', () => {
    const extra = {...TWO, answers: {focus: ['health']}, packs: [{...TWO.packs[0], scores: [1, 2], badHabit: 'porn'}]};
    const json = r.serialisePacks(extra as PacksRecord);
    assert.doesNotMatch(json, /answers|scores|badHabit|porn/);
  });

  test('pack names: trimmed, 1 to 24 characters, no control characters; uniqueness ignores case', () => {
    assert.deepEqual(r.validatePackName('  Morning  '), {valid: true, value: 'Morning'});
    assert.deepEqual(r.validatePackName('x'.repeat(24)), {valid: true, value: 'x'.repeat(24)});
    assert.deepEqual(r.validatePackName('x'.repeat(25)), {valid: false, reason: 'long'});
    assert.deepEqual(r.validatePackName('   '), {valid: false, reason: 'empty'});
    assert.deepEqual(r.validatePackName(null), {valid: false, reason: 'empty'});
    assert.deepEqual(r.validatePackName('a\nb'), {valid: false, reason: 'control'});
    assert.equal(r.packNameTaken(TWO, ' calm MIND '), true);
    assert.equal(r.packNameTaken(TWO, 'Calm Mind', 'calm_mind'), false);
    assert.equal(r.packNameTaken(TWO, 'Evenings'), false);
  });
});

describe('the mirror', () => {
  test('round-trips a record, "none" and "corrupt" for its uid, with the "Not now" flag', () => {
    const ok = r.parsePacks(r.serialisePacks(TWO));
    for (const parsed of [ok, {kind: 'none'} as const, {kind: 'corrupt'} as const]) {
      assert.deepEqual(r.parseMirror(r.serialiseMirror('u1', parsed)), {uid: 'u1', parsed, dismissed: false});
      assert.deepEqual(r.parseMirror(r.serialiseMirror('u1', parsed, true)), {uid: 'u1', parsed, dismissed: true});
    }
  });

  test('a Stage 1a mirror (no flag) still reads, as not dismissed', () => {
    assert.deepEqual(r.parseMirror('{"uid":"u1","record":null}'), {uid: 'u1', parsed: {kind: 'none'}, dismissed: false});
    assert.deepEqual(r.parseMirror('{"uid":"u1","record":null,"dismissed":"yes"}')?.dismissed, false);
  });

  test('anything else is no mirror at all', () => {
    for (const raw of [null, '', 'x', '[]', '{}', '{"uid":"u1"}', '{"uid":"","record":null}', '{"uid":"u1","record":{"version":3}}']) {
      assert.equal(r.parseMirror(raw), null, String(raw));
    }
  });
});

// A Map as storage; counts every call, and can be told to fail
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const calls = {getItem: 0, multiSet: 0};
  const fail = {get: false, set: false};
  return {
    data, calls, fail,
    storage: {
      getItem: async (key: string) => {
        calls.getItem += 1;
        if (fail.get) throw new Error('read failed');
        return data.get(key) ?? null;
      },
      multiSet: async (pairs: [string, string][]) => {
        calls.multiSet += 1;
        if (fail.set) throw new Error('disk full');
        for (const [k, v] of pairs) data.set(k, v);
      },
    },
  };
}

describe('the store', () => {
  test('a matching mirror is used as is: no storage read at all', async () => {
    const m = memoryStorage({[r.packsKey('u1')]: r.serialisePacks(TWO)});
    const store = createPacksStore(m.storage);
    store.loadMirror(r.serialiseMirror('u1', r.parsePacks(r.serialisePacks(TWO))));
    const parsed = await store.read('u1');
    assert.equal(parsed.kind, 'ok');
    assert.equal(m.calls.getItem, 0);
    assert.equal(m.calls.multiSet, 0);
  });

  test('a mirror for another uid is ignored: the canonical record is read and the mirror rebuilt from it', async () => {
    const m = memoryStorage({[r.packsKey('u2')]: r.serialisePacks(TWO)});
    const store = createPacksStore(m.storage);
    store.loadMirror(r.serialiseMirror('u1', {kind: 'none'}));
    const parsed = await store.read('u2');
    assert.equal(parsed.kind, 'ok');
    assert.equal(m.calls.getItem, 2);// the record and the "Not now" flag
    await store.update('u2', () => null);// waits for queued saves
    assert.deepEqual(r.parseMirror(m.data.get(r.PACKS_MIRROR_KEY) ?? null), {uid: 'u2', parsed, dismissed: false});
    await store.read('u2');
    assert.equal(m.calls.getItem, 2);// remembered
  });

  test('no mirror: the same, and a corrupt record is mirrored as corrupt', async () => {
    const m = memoryStorage({[r.packsKey('u1')]: '{broken'});
    const store = createPacksStore(m.storage);
    store.loadMirror(null);
    assert.deepEqual(await store.read('u1'), {kind: 'corrupt'});
    await store.update('u1', () => null);
    assert.deepEqual(r.parseMirror(m.data.get(r.PACKS_MIRROR_KEY) ?? null), {uid: 'u1', parsed: {kind: 'corrupt'}, dismissed: false});
  });

  test('peek: what the mirror or a read left in memory, without reading; listeners hear every change', async () => {
    const m = memoryStorage();
    const store = createPacksStore(m.storage);
    let heard = 0;
    const off = store.subscribe(() => {
      heard += 1;
    });
    assert.equal(store.peek('u1'), undefined);
    store.loadMirror(r.serialiseMirror('u1', {kind: 'none'}));
    assert.deepEqual(store.peek('u1'), {parsed: {kind: 'none'}, dismissed: false});
    const before = store.peek('u1');
    await store.write('u1', TWO);
    assert.notEqual(store.peek('u1'), before);// a new snapshot object
    assert.equal(store.peek('u1')?.parsed.kind, 'ok');
    assert.equal(heard, 2);
    off();
    await store.dismissChoose('u1');
    assert.equal(heard, 2);
    assert.equal(m.calls.getItem, 0);
  });

  test('"Not now": saved per user with the mirror in one multiSet, kept by later pack writes, read back for another uid', async () => {
    const m = memoryStorage();
    const store = createPacksStore(m.storage);
    store.loadMirror(r.serialiseMirror('u1', {kind: 'none'}));
    await store.dismissChoose('u1');
    assert.equal(m.calls.multiSet, 1);
    assert.equal(m.data.get(r.chooseDismissedKey('u1')), r.DISMISSED_VALUE);
    assert.deepEqual(r.parseMirror(m.data.get(r.PACKS_MIRROR_KEY) ?? null), {uid: 'u1', parsed: {kind: 'none'}, dismissed: true});
    await store.write('u1', TWO);
    assert.equal(r.parseMirror(m.data.get(r.PACKS_MIRROR_KEY) ?? null)?.dismissed, true);

    // a fresh app run for another account on this phone, then back: the flag comes from its own key
    const later = createPacksStore(m.storage);
    later.loadMirror(r.serialiseMirror('u2', {kind: 'none'}));
    assert.equal((await later.read('u2')).kind, 'none');
    assert.equal(later.peek('u2')?.dismissed, false);
    await later.read('u1');
    assert.equal(later.peek('u1')?.dismissed, true);
  });

  test('"Not now" with an unreadable storage saves only the flag and remembers nothing', async () => {
    const m = memoryStorage();
    const store = createPacksStore(m.storage);
    m.fail.get = true;
    await store.dismissChoose('u1');
    assert.equal(store.peek('u1'), undefined);
    assert.equal(m.data.get(r.chooseDismissedKey('u1')), r.DISMISSED_VALUE);
    assert.equal(m.data.has(r.PACKS_MIRROR_KEY), false);
  });

  test('a write saves the record and the mirror in one multiSet', async () => {
    const m = memoryStorage();
    const store = createPacksStore(m.storage);
    await store.write('u1', TWO);
    assert.equal(m.calls.multiSet, 1);
    assert.equal(r.parsePacks(m.data.get(r.packsKey('u1')) ?? null).kind, 'ok');
    assert.deepEqual(r.parseMirror(m.data.get(r.PACKS_MIRROR_KEY) ?? null)?.uid, 'u1');
    assert.deepEqual(await store.read('u1'), r.parsePacks(r.serialisePacks(TWO)));
    assert.equal(m.calls.getItem, 0);
  });

  test('update: reads, changes and writes one at a time; null writes nothing; never throws', async () => {
    const m = memoryStorage();
    const store = createPacksStore(m.storage);
    const seen: string[] = [];
    await Promise.all([
      store.update('u1', (parsed) => {
        seen.push(parsed.kind);
        return TWO;
      }),
      store.update('u1', (parsed) => {
        seen.push(parsed.kind);
        return null;
      }),
    ]);
    assert.deepEqual(seen, ['none', 'ok']);
    m.fail.set = true;
    await store.update('u1', () => TWO);// a failed save: no throw, kept in memory for this run
    assert.equal((await store.read('u1')).kind, 'ok');
  });

  test('an unreadable storage reads as corrupt, is not remembered, and update writes nothing over it (R-1)', async () => {
    const m = memoryStorage({[r.packsKey('u1')]: r.serialisePacks(TWO)});
    const store = createPacksStore(m.storage);
    m.fail.get = true;
    assert.deepEqual(await store.read('u1'), {kind: 'corrupt'});
    let changed = 0;
    const result = await store.update('u1', () => {
      changed += 1;
      return TWO;
    });
    assert.equal(result, 'unreadable');
    assert.equal(changed, 0, 'change is not even asked');
    assert.equal(m.calls.multiSet, 0);
    m.fail.get = false;
    assert.equal((await store.read('u1')).kind, 'ok');
  });
});

describe('startup', () => {
  test('the mirror is read in the sign-in marker\'s one multiGet (zero extra native calls)', () => {
    const marker = readFileSync(new URL('../services/authMarker.ts', import.meta.url), 'utf8');
    assert.match(marker, /AsyncStorage\.multiGet\(\[KEY, PROFILE_NAME_KEY, PACKS_MIRROR_KEY\]\)/);
    assert.match(marker, /packsStore\.loadMirror\(/);
    assert.doesNotMatch(marker, /AsyncStorage\.getItem\(/);
    assert.equal(marker.match(/AsyncStorage\.multiGet\(/g)?.length, 1);
  });

  test('loading the mirror reads nothing', async () => {
    const m = memoryStorage();
    createPacksStore(m.storage).loadMirror(r.serialiseMirror('u1', {kind: 'none'}));
    assert.deepEqual(m.calls, {getItem: 0, multiSet: 0});
  });
});
