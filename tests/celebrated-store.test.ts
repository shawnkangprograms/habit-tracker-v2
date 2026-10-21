// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {createCelebratedStore, datedKeyCutoff} from '../services/celebratedStore.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// AsyncStorage stand-in; `delayMs` makes writes slow so overlapping saves can be tested
function fakeStorage(initial: Record<string, string> = {}, delayMs = 0) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key: string) { return data.get(key) ?? null; },
    async setItem(key: string, value: string) {
      if (delayMs) await sleep(delayMs);
      data.set(key, value);
    },
  };
}

const saved = (storage: ReturnType<typeof fakeStorage>, uid: string) =>
  new Set(JSON.parse(storage.data.get(`celebrated:v1:${uid}`) ?? '[]'));

describe('celebrated store', () => {
  test('once only: a marked key stays marked, also for a new store on the same storage (restart)', async () => {
    const storage = fakeStorage();
    const store = createCelebratedStore(storage);
    assert.equal((await store.load('u1')).has('level:2'), false);
    await store.mark('u1', ['level:2'], '2026-10-21');
    assert.equal((await store.load('u1')).has('level:2'), true);
    assert.equal((await createCelebratedStore(storage).load('u1')).has('level:2'), true);
  });

  test('per user: one account never sees another\'s keys', async () => {
    const store = createCelebratedStore(fakeStorage());
    await store.mark('u1', ['streak:3'], '2026-10-21');
    assert.equal((await store.load('u2')).has('streak:3'), false);
  });

  test('corrupt or non-array data counts as nothing celebrated', async () => {
    const store = createCelebratedStore(fakeStorage({'celebrated:v1:u1': '{oops', 'celebrated:v1:u2': '{"a":1}'}));
    assert.equal((await store.load('u1')).size, 0);
    assert.equal((await store.load('u2')).size, 0);
  });

  test('dated keys older than 7 days are pruned; level and streak keys never are', async () => {
    assert.equal(datedKeyCutoff('2026-10-21'), '2026-10-14');
    assert.equal(datedKeyCutoff('2026-03-03'), '2026-02-24');
    const storage = fakeStorage({
      'celebrated:v1:u1': JSON.stringify(['level:2', 'streak:3', 'perfect:2026-10-13', 'early:2026-10-13', 'perfect:2026-10-14', 'early:2026-10-20']),
    });
    const store = createCelebratedStore(storage);
    await store.mark('u1', ['perfect:2026-10-21'], '2026-10-21');
    assert.deepEqual(
      [...saved(storage, 'u1')].sort(),
      ['early:2026-10-20', 'level:2', 'perfect:2026-10-14', 'perfect:2026-10-21', 'streak:3'],
    );
  });

  test('overlapping marks lose nothing, and the in-memory set updates before the save finishes', async () => {
    const storage = fakeStorage({}, 15);
    const store = createCelebratedStore(storage);
    const a = store.mark('u1', ['level:2'], '2026-10-21');
    const b = store.mark('u1', ['streak:3'], '2026-10-21');
    await sleep(1);
    const inMemory = await store.load('u1');
    assert.ok(inMemory.has('level:2') && inMemory.has('streak:3'));
    await Promise.all([a, b]);
    assert.deepEqual([...saved(storage, 'u1')].sort(), ['level:2', 'streak:3']);
  });

  test('marking nothing (a repeat) never writes to storage', async () => {
    let writes = 0;
    const store = createCelebratedStore({
      async getItem() { return JSON.stringify(['level:3']); },
      async setItem() { writes += 1; },
    });
    await store.mark('u1', [], '2026-10-21');
    assert.equal(writes, 0);
    assert.deepEqual([...(await store.load('u1'))], ['level:3']);
  });

  test('a failing save never throws', async () => {
    const store = createCelebratedStore({
      async getItem() { return null; },
      async setItem() { throw new Error('disk full'); },
    });
    await store.mark('u1', ['level:2'], '2026-10-21');
    assert.equal((await store.load('u1')).has('level:2'), true);
  });
});
