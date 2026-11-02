// The insight card's per-user cache (services/insightCache.ts), with a Map as storage. Node's built-in runner.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {KeyValueStorage} from '@/services/celebratedStore';

const {createInsightCache, parseEntry, cacheKey} = await import('../services/insightCache.ts');
const {EMPTY_ENTRY} = await import('../utils/insightSchedule.ts');

const INSIGHT = {day: '2026-10-29', teaser: 'Hydration is your anchor.', detail: 'You drank water 18 of 21 days.'};
const ENTRY = {v: 1 as const, insight: INSIGHT, attemptedDay: '2026-10-29', attemptStatus: null};

function mapStorage(initial: Record<string, string> = {}): KeyValueStorage & {data: Map<string, string>} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

describe('parseEntry', () => {
  test('missing, corrupt, another version or not an object: empty', () => {
    for (const raw of [null, '', 'not json', '[]', '42', '{"v":2}', JSON.stringify({...ENTRY, v: '1'})]) {
      assert.deepEqual(parseEntry(raw), EMPTY_ENTRY, String(raw));
    }
  });

  test('a bad insight or attempt field is dropped on its own', () => {
    assert.deepEqual(parseEntry(JSON.stringify({...ENTRY, insight: {...INSIGHT, teaser: 'x'.repeat(91)}})),
      {v: 1, insight: null, attemptedDay: '2026-10-29', attemptStatus: null});
    assert.deepEqual(parseEntry(JSON.stringify({v: 1, insight: INSIGHT, attemptedDay: 'today', attemptStatus: 'limit'})),
      {v: 1, insight: INSIGHT, attemptedDay: null, attemptStatus: null});
    assert.deepEqual(parseEntry(JSON.stringify({v: 1, insight: null, attemptedDay: '2026-10-29', attemptStatus: 'nope'})),
      {v: 1, insight: null, attemptedDay: '2026-10-29', attemptStatus: null});
  });

  test('limit and refused attempts are kept', () => {
    for (const attemptStatus of ['limit', 'refused']) {
      const stored = {v: 1, insight: null, attemptedDay: '2026-10-29', attemptStatus};
      assert.deepEqual(parseEntry(JSON.stringify(stored)), stored);
    }
  });

  test('an older build\'s unavailable attempt is dropped (the user is retried); the insight stays', () => {
    assert.deepEqual(parseEntry(JSON.stringify({v: 1, insight: null, attemptedDay: '2026-10-29', attemptStatus: 'unavailable'})), EMPTY_ENTRY);
    const old = {...INSIGHT, day: '2026-10-27'};
    assert.deepEqual(parseEntry(JSON.stringify({v: 1, insight: old, attemptedDay: '2026-10-29', attemptStatus: 'unavailable'})),
      {v: 1, insight: old, attemptedDay: null, attemptStatus: null});
  });

  test('extra stored fields are not carried over', () => {
    assert.deepEqual(parseEntry(JSON.stringify({...ENTRY, insight: {...INSIGHT, html: '<b>'}, extra: 1})), ENTRY);
  });
});

describe('createInsightCache', () => {
  test('write then read, under insight:v1:<uid>', async () => {
    const storage = mapStorage();
    const cache = createInsightCache(storage);
    await cache.write('u1', ENTRY);
    assert.deepEqual(JSON.parse(storage.data.get(cacheKey('u1'))!), ENTRY);
    assert.equal(cacheKey('u1'), 'insight:v1:u1');
    assert.deepEqual(await createInsightCache(storage).read('u1'), ENTRY);// a fresh app run reads storage
  });

  test('users are isolated', async () => {
    const storage = mapStorage({[cacheKey('u1')]: JSON.stringify(ENTRY)});
    const cache = createInsightCache(storage);
    assert.deepEqual(await cache.read('u2'), EMPTY_ENTRY);
    assert.deepEqual(await cache.read('u1'), ENTRY);
  });

  test('storage is read once per uid; later reads come from memory', async () => {
    const storage = mapStorage({[cacheKey('u1')]: JSON.stringify(ENTRY)});
    let reads = 0;
    const counting = {...storage, getItem: async (key: string) => {
      reads += 1;
      return storage.getItem(key);
    }};
    const cache = createInsightCache(counting);
    await cache.read('u1');
    await cache.read('u1');
    assert.equal(reads, 1);
  });

  test('never throws: unreadable storage reads as empty, a failed save still updates memory', async () => {
    const broken: KeyValueStorage = {
      getItem: async () => {
        throw new Error('no storage');
      },
      setItem: async () => {
        throw new Error('disk full');
      },
    };
    const cache = createInsightCache(broken);
    assert.deepEqual(await cache.read('u1'), EMPTY_ENTRY);
    await assert.doesNotReject(cache.write('u1', ENTRY));
    assert.deepEqual(await cache.read('u1'), ENTRY);
  });
});
