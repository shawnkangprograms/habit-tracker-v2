// The reflection store (services/reflectionsStoreCore.ts) on an in-memory storage: per-user keys, read once,
// one save at a time, never writing over unreadable storage, and the reward-pending flag Home takes on focus.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Answers} from '../utils/reflections/questions.ts';

const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');

const DAY = '2026-11-05';
const ANSWERS: Answers = {feel: 'easy', amount: 'most', helped: 'self', blocker: 'tired'};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const calls = {get: 0, set: 0};
  let failGet = false;
  let failSet = false;
  return {
    data, calls,
    failReads(on: boolean) { failGet = on; },
    failWrites(on: boolean) { failSet = on; },
    async getItem(key: string) {
      calls.get += 1;
      if (failGet) throw new Error('read failed');
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      calls.set += 1;
      if (failSet) throw new Error('write failed');
      data.set(key, value);
    },
  };
}

const input = (habitId: string, savedAt = 1, text = '') => ({habitId, date: DAY, answers: ANSWERS, text, savedAt});

describe('reflections store', () => {
  test('saves per user under reflections:v1:<uid>, and reads from memory after the first read', async () => {
    const storage = memoryStorage();
    const store = createReflectionsStore(storage);
    assert.equal(await store.save('u1', input('a', 1, 'note')), 'saved');
    assert.ok(storage.data.has('reflections:v1:u1'));
    assert.ok(!storage.data.has('reflections:v1:u2'));
    const before = storage.calls.get;
    const rec = await store.read('u1');
    assert.equal(storage.calls.get, before);
    assert.equal(rec.days[DAY].a.text, 'note');
    assert.deepEqual((await store.read('u2')).days, {}, 'another user sees nothing');
  });

  test('one reflection per habit per day', async () => {
    const store = createReflectionsStore(memoryStorage());
    assert.equal(await store.save('u1', input('a', 1)), 'saved');
    assert.equal(await store.save('u1', input('a', 2)), 'exists');
  });

  test('two saves at once both land (one at a time, in order)', async () => {
    const storage = memoryStorage();
    const store = createReflectionsStore(storage);
    const results = await Promise.all([store.save('u1', input('a', 1)), store.save('u1', input('b', 2))]);
    assert.deepEqual(results, ['saved', 'saved']);
    const stored = JSON.parse(storage.data.get('reflections:v1:u1')!);
    assert.deepEqual(Object.keys(stored.days[DAY]).sort(), ['a', 'b']);
  });

  test('a failed write reports failed and changes nothing in memory', async () => {
    const storage = memoryStorage();
    const store = createReflectionsStore(storage);
    storage.failWrites(true);
    assert.equal(await store.save('u1', input('a')), 'failed');
    assert.equal((await store.read('u1')).days[DAY], undefined);
    storage.failWrites(false);
    assert.equal(await store.save('u1', input('a')), 'saved');
  });

  test('unreadable storage reads as empty, is retried, and is never written over', async () => {
    const storage = memoryStorage({'reflections:v1:u1': JSON.stringify({version: 1, days: {[DAY]: {x: {...ANSWERS, savedAt: 1}}}})});
    const store = createReflectionsStore(storage);
    storage.failReads(true);
    assert.deepEqual((await store.read('u1')).days, {});
    assert.equal(await store.save('u1', input('a')), 'failed');
    assert.equal(storage.calls.set, 0);
    storage.failReads(false);
    assert.deepEqual(Object.keys((await store.read('u1')).days[DAY]), ['x']);
  });

  test('a corrupt record reads as empty and the next save replaces it', async () => {
    const storage = memoryStorage({'reflections:v1:u1': '{not json'});
    const store = createReflectionsStore(storage);
    assert.deepEqual((await store.read('u1')).days, {});
    assert.equal(await store.save('u1', input('a')), 'saved');
    assert.equal(JSON.parse(storage.data.get('reflections:v1:u1')!).version, 1);
  });

  test('reward pending: taken once, only by the same user', () => {
    const store = createReflectionsStore(memoryStorage());
    assert.equal(store.takeRewardPending('u1'), false);
    store.markRewardPending('u1');
    assert.equal(store.takeRewardPending('u2'), false);
    assert.equal(store.takeRewardPending('u1'), true);
    assert.equal(store.takeRewardPending('u1'), false);
  });
});
