// The reflection store (services/reflectionsStoreCore.ts) on an in-memory storage: per-user year keys, read once,
// one save at a time, never writing over unreadable storage, and the reward-pending flag Home takes on focus.
// Migration, rollback, kills and sizes (F-1) are in tests/reflections-years.test.ts.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';
import type {Answers} from '../utils/reflections/questions.ts';

const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');

const DAY = '2026-11-05';
const YEAR_KEY = 'reflections:v2:u1:2026';
const MARKER = 'reflections:migrated:v2:u1';
const ANSWERS: Answers = {feel: 'easy', amount: 'most', helped: 'self', blocker: 'tired'};

const input = (habitId: string, savedAt = 1, text = '') => ({habitId, date: DAY, answers: ANSWERS, text, savedAt});

describe('reflections store', () => {
  test('saves per user under reflections:v2:<uid>:<yyyy> with the marker, and reads from memory after the first read', async () => {
    const storage = kvStorage();
    const store = createReflectionsStore(storage);
    assert.equal(await store.save('u1', input('a', 1, 'note')), 'saved');
    assert.ok(storage.data.has(YEAR_KEY));
    assert.deepEqual(JSON.parse(storage.data.get(MARKER)!).years, [2026]);
    assert.ok(![...storage.data.keys()].some((k) => k.includes(':u2')));
    const before = storage.calls.length;
    const rec = await store.read('u1');
    assert.equal(storage.calls.length, before);
    assert.equal(rec.days[DAY].a.text, 'note');
    assert.deepEqual((await store.read('u2')).days, {}, 'another user sees nothing');
  });

  test('one reflection per habit per day', async () => {
    const store = createReflectionsStore(kvStorage());
    assert.equal(await store.save('u1', input('a', 1)), 'saved');
    assert.equal(await store.save('u1', input('a', 2)), 'exists');
  });

  test('two saves at once both land (one at a time, in order)', async () => {
    const storage = kvStorage();
    const store = createReflectionsStore(storage);
    const results = await Promise.all([store.save('u1', input('a', 1)), store.save('u1', input('b', 2))]);
    assert.deepEqual(results, ['saved', 'saved']);
    const stored = JSON.parse(storage.data.get(YEAR_KEY)!);
    assert.deepEqual(Object.keys(stored.days[DAY]).sort(), ['a', 'b']);
  });

  test('a failed write reports failed and changes nothing in memory', async () => {
    const storage = kvStorage();
    const store = createReflectionsStore(storage);
    await store.read('u1');// the marker is written on the first read
    storage.failWrites([YEAR_KEY]);
    assert.equal(await store.save('u1', input('a')), 'failed');
    assert.equal((await store.read('u1')).days[DAY], undefined);
    storage.failWrites([YEAR_KEY], false);
    assert.equal(await store.save('u1', input('a')), 'saved');
  });

  test('unreadable storage rejects (never "no reflections"), is retried, and is never written over', async () => {
    const storage = kvStorage({'reflections:v1:u1': JSON.stringify({version: 1, days: {[DAY]: {x: {...ANSWERS, savedAt: 1}}}})});
    const store = createReflectionsStore(storage);
    storage.failReads('all');
    await assert.rejects(store.read('u1'), /CursorWindow|read failed/);
    assert.equal(await store.save('u1', input('a')), 'failed');
    assert.deepEqual(storage.writes(), []);
    storage.failReads('all', false);
    assert.deepEqual(Object.keys((await store.read('u1')).days[DAY]), ['x']);
  });

  test('a corrupt year reads as none and the next save into that year replaces it', async () => {
    const storage = kvStorage({[YEAR_KEY]: '{not json', [MARKER]: JSON.stringify({version: 1, years: [2026], v1Length: 0})});
    const store = createReflectionsStore(storage);
    assert.deepEqual((await store.read('u1')).days, {});
    assert.equal(await store.save('u1', input('a')), 'saved');
    assert.equal(JSON.parse(storage.data.get(YEAR_KEY)!).version, 1);
    assert.deepEqual(JSON.parse(storage.data.get(MARKER)!).years, [2026]);
  });

  test('a date that is not YYYY-MM-DD is refused without a write', async () => {
    const storage = kvStorage();
    const store = createReflectionsStore(storage);
    await store.read('u1');
    const writes = storage.writes().length;
    assert.equal(await store.save('u1', {...input('a'), date: 'someday'}), 'failed');
    assert.equal(storage.writes().length, writes);
  });

  test('reward pending: taken once, only by the same user', () => {
    const store = createReflectionsStore(kvStorage());
    assert.equal(store.takeRewardPending('u1'), false);
    store.markRewardPending('u1');
    assert.equal(store.takeRewardPending('u2'), false);
    assert.equal(store.takeRewardPending('u1'), true);
    assert.equal(store.takeRewardPending('u1'), false);
  });
});
