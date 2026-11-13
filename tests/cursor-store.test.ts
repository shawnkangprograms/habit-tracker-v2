// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic import below

const {createCursorStore, emptyCursorState} = await import('../sync/cursorStore.ts');

function mapStorage(map = new Map<string, string>()) {
  return {
    map,
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const CURSOR = {seconds: 1_700_000_001, nanoseconds: 5, docId: 'abc'};

test('round trip, kept separately per uid', async () => {
  const storage = mapStorage();
  const store = createCursorStore(storage, 1);
  await store.save('a', {parserVersion: 1, habitsCursor: CURSOR, completionsCursor: null, initialPullDone: true});
  assert.deepEqual(await store.load('a'), {parserVersion: 1, habitsCursor: CURSOR, completionsCursor: null, initialPullDone: true});
  assert.deepEqual(await store.load('b'), emptyCursorState(1));
  assert.deepEqual([...storage.map.keys()], ['sync:a']);
});

test('missing, corrupt or malformed state means "pull from the start"', async () => {
  const storage = mapStorage(new Map([
    ['sync:corrupt', '{not json'],
    ['sync:bad-cursor', JSON.stringify({parserVersion: 1, habitsCursor: {seconds: 'x'}, completionsCursor: CURSOR, initialPullDone: true})],
  ]));
  const store = createCursorStore(storage, 1);
  assert.deepEqual(await store.load('corrupt'), emptyCursorState(1));
  assert.deepEqual(await store.load('bad-cursor'),
    {parserVersion: 1, habitsCursor: null, completionsCursor: CURSOR, initialPullDone: true});

});

test('R-1: storage that can\'t be read rejects (never "pull from the start"), and reset writes nothing', async () => {
  let writes = 0;
  const broken = createCursorStore({getItem: async () => { throw new Error('storage down'); }, setItem: async () => { writes += 1; }}, 1);
  await assert.rejects(broken.load('a'), /storage down/);
  await assert.rejects(broken.reset('a'), /storage down/);
  assert.equal(writes, 0);
});

test('a different parser version resets the cursors but keeps initialPullDone', async () => {
  const storage = mapStorage();
  await createCursorStore(storage, 1).save('a',
    {parserVersion: 1, habitsCursor: CURSOR, completionsCursor: CURSOR, initialPullDone: true});
  assert.deepEqual(await createCursorStore(storage, 2).load('a'),
    {parserVersion: 2, habitsCursor: null, completionsCursor: null, initialPullDone: true});
});

test('reset ("Re-sync everything") clears the cursors and keeps initialPullDone', async () => {
  const storage = mapStorage();
  const store = createCursorStore(storage, 1);
  await store.save('a', {parserVersion: 1, habitsCursor: CURSOR, completionsCursor: CURSOR, initialPullDone: true});
  await store.reset('a');
  assert.deepEqual(await store.load('a'),
    {parserVersion: 1, habitsCursor: null, completionsCursor: null, initialPullDone: true});
});
