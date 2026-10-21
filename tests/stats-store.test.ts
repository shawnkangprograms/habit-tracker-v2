// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {GamificationStats} from '../utils/gamification.ts';

// Same module instances the store subscribes to (the alias resolves "@/db/..." to these files)
const {emitLocalChange, onLocalChange} = await import('../db/localChanges.js');
const {emitRemoteChange, onRemoteChange} = await import('../db/remoteChanges.js');
const store = await import('../services/statsStore.ts');
const {computeGamification} = await import('../utils/gamification.ts');

const TODAY = '2026-10-21';
const BASE = computeGamification([], [], TODAY);
const withStreak = (currentStreak: number): GamificationStats => ({...BASE, currentStreak, longestStreak: currentStreak});

// The store is module state: every test signs in a user of its own
let userCount = 0;
function freshUser(): string {
  const userId = `user-${++userCount}`;
  store.reset(userId);
  return userId;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return {promise, resolve};
}

async function loadAndPublish(userId: string, stats: GamificationStats, date = TODAY) {
  const load = store.beginLoad(userId, date, async () => stats);
  store.publish(await load.promise, load.gen);
}

describe('stats store: freshness', () => {
  test('needs a load when empty, for another user, or on another day; not right after a publish', async () => {
    const userId = freshUser();
    assert.equal(store.needsLoad(userId, TODAY), true);
    await loadAndPublish(userId, withStreak(2));
    assert.equal(store.needsLoad(userId, TODAY), false);
    assert.equal(store.needsLoad('someone-else', TODAY), true);
    assert.equal(store.needsLoad(userId, '2026-10-22'), true);// after midnight
  });

  test('a change makes it stale; a load that began before the change does not clear that', async () => {
    const userId = freshUser();
    await loadAndPublish(userId, withStreak(2));

    const gate = deferred<GamificationStats>();
    const early = store.beginLoad(userId, TODAY, () => gate.promise);
    emitLocalChange();// arrives while the read is running
    gate.resolve(withStreak(3));
    store.publish(await early.promise, early.gen);
    assert.equal(store.getEntry()?.stats.currentStreak, 3);// the data is shown...
    assert.equal(store.needsLoad(userId, TODAY), true);// ...but it is not fresh

    await loadAndPublish(userId, withStreak(3));
    assert.equal(store.needsLoad(userId, TODAY), false);
  });

  test('listener order: markStale runs before a screen handler can call beginLoad (local and remote)', async () => {
    // A screen subscribes after the store module was imported, as every screen does. Its handler starts a
    // load straight away; that load must capture the generation AFTER the change, so its publish is fresh.
    for (const [subscribe, emit] of [[onLocalChange, emitLocalChange], [onRemoteChange, emitRemoteChange]] as const) {
      const userId = freshUser();
      await loadAndPublish(userId, withStreak(1));
      const loads: Promise<void>[] = [];
      const off = subscribe(() => {
        const load = store.beginLoad(userId, TODAY, async () => withStreak(2));
        loads.push(load.promise.then((e) => store.publish(e, load.gen)));
      });
      try {
        emit();
        await Promise.all(loads);
      } finally {
        off();
      }
      assert.equal(loads.length, 1);
      assert.equal(store.getEntry()?.stats.currentStreak, 2);
      assert.equal(store.needsLoad(userId, TODAY), false, 'the handler\'s load captured a stale generation');
    }
  });
});

describe('stats store: snapshots and notifications', () => {
  test('getEntry keeps the same reference until a publish changes something', async () => {
    const userId = freshUser();
    let notified = 0;
    const off = store.subscribe(() => { notified += 1; });
    try {
      await loadAndPublish(userId, withStreak(4));
      const first = store.getEntry();
      assert.equal(notified, 1);
      assert.equal(store.getEntry(), first);// repeated reads, same object

      await loadAndPublish(userId, withStreak(4));// deep-equal copy
      assert.equal(store.getEntry(), first);
      assert.equal(notified, 1);

      await loadAndPublish(userId, withStreak(5));
      assert.notEqual(store.getEntry(), first);
      assert.equal(store.getEntry()?.stats.currentStreak, 5);
      assert.equal(notified, 2);
    } finally {
      off();
    }
  });

  test('publishes for another user, or older than what is shown, are ignored', async () => {
    const userId = freshUser();
    const gate = deferred<GamificationStats>();
    const older = store.beginLoad(userId, TODAY, () => gate.promise);
    emitLocalChange();
    await loadAndPublish(userId, withStreak(7));// started later, finished first
    gate.resolve(withStreak(6));
    store.publish(await older.promise, older.gen);
    assert.equal(store.getEntry()?.stats.currentStreak, 7);

    const shown = store.getEntry();
    store.publish({userId: 'intruder', date: TODAY, stats: withStreak(99)}, Number.MAX_SAFE_INTEGER);
    assert.equal(store.getEntry(), shown);
  });

  test('reset: another user clears and notifies; the same user keeps everything', async () => {
    const userId = freshUser();
    await loadAndPublish(userId, withStreak(3));
    let notified = 0;
    const off = store.subscribe(() => { notified += 1; });
    try {
      const shown = store.getEntry();
      store.reset(userId);
      assert.equal(store.getEntry(), shown);
      assert.equal(notified, 0);

      store.reset(null);// sign-out
      assert.equal(store.getEntry(), null);
      assert.equal(notified, 1);
    } finally {
      off();
    }
  });
});

describe('stats store: loadShared (Profile)', () => {
  test('reuses a fresh entry without calling the loader', async () => {
    const userId = freshUser();
    await loadAndPublish(userId, withStreak(2));
    let calls = 0;
    const result = await store.loadShared(userId, TODAY, async () => { calls += 1; return withStreak(9); });
    assert.equal(result.source, 'reused');
    assert.equal(calls, 0);
    assert.equal(result.entry?.stats.currentStreak, 2);
  });

  test('joins a load Home started, without a second read', async () => {
    const userId = freshUser();
    const gate = deferred<GamificationStats>();
    const home = store.beginLoad(userId, TODAY, () => gate.promise);
    let calls = 0;
    const profile = store.loadShared(userId, TODAY, async () => { calls += 1; return withStreak(9); });
    gate.resolve(withStreak(4));
    store.publish(await home.promise, home.gen);
    const result = await profile;
    assert.equal(result.source, 'joined');
    assert.equal(calls, 0);
    assert.equal(result.entry?.stats.currentStreak, 4);
  });

  test('two loads at once read the database once', async () => {
    const userId = freshUser();
    let calls = 0;
    const loader = async () => { calls += 1; return withStreak(1); };
    const [a, b] = await Promise.all([store.loadShared(userId, TODAY, loader), store.loadShared(userId, TODAY, loader)]);
    assert.equal(calls, 1);
    assert.deepEqual([a.source, b.source], ['loaded', 'joined']);
  });

  test('does not join a load that started before the latest change', async () => {
    const userId = freshUser();
    const gate = deferred<GamificationStats>();
    store.beginLoad(userId, TODAY, () => gate.promise);
    emitRemoteChange();
    let calls = 0;
    const result = await store.loadShared(userId, TODAY, async () => { calls += 1; return withStreak(8); });
    gate.resolve(withStreak(1));
    assert.equal(result.source, 'loaded');
    assert.equal(calls, 1);
    assert.equal(result.entry?.stats.currentStreak, 8);
  });

  test('a failed load leaves the store empty and still needing a load', async () => {
    const userId = freshUser();
    const original = console.log;
    console.log = () => {};// the store logs the failure
    try {
      const result = await store.loadShared(userId, TODAY, async () => { throw new Error('db closed'); });
      assert.equal(result.source, 'loaded');
      assert.equal(result.entry, null);
      assert.equal(store.needsLoad(userId, TODAY), true);
    } finally {
      console.log = original;
    }
  });
});
