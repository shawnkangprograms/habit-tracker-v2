// S-1: a phone whose clock is behind (or was moved back) must not lose its own edits (docs/TEST_STRATEGY.md, Part B;
// the rule in docs/HABITQUEST_DESIGN.md). Through the real write paths (db/habits.js, db/completions.js), the real
// engine (sync/engineCore.ts), merge (sync/merge.ts) and a fake Firestore that enforces the rules' update checks.
// The tests of the decided behaviour are marked todo until the fix lands (Phase 1b). Node's built-in runner.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createDevice, createFakeServer, type Device} from './helpers/fake-firestore.ts';

// db/habits.js and db/completions.js get their connection from '@/db/database' (expo-sqlite) and ids from expo-crypto,
// neither of which loads under Node. These hooks, registered after alias.ts so they run first, swap in stubs: the
// database is whichever device is acting (globalThis.__skewDb), ids come from node:crypto.
(globalThis as {__uuid?: () => string}).__uuid = randomUUID;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/database') {
      const stub = 'export async function getDatabase() { return globalThis.__skewDb; }';
      return {url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true};
    }
    if (specifier === 'expo-crypto') {
      const stub = 'export function randomUUID() { return globalThis.__uuid(); }';
      return {url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});

const habits = await import('../db/habits.js');
const completions = await import('../db/completions.js');
const {getLocalDateString} = await import('../utils/dates.ts');

const UID = 'uid-skew';
const T0 = 1_762_000_000_000;// real time when the story starts
const MIN = 60_000;
const HOUR = 60 * MIN;
const input = (habitName: string) => ({
  habitName, icon: 'book', frequency: {type: 'daily'}, reminderTime: null, alarm: false, remindBeforeMin: 0,
});

// A user action on this phone: the app's own write path, with the phone's clock as Date.now()
async function onPhone<T>(device: Device, action: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  (globalThis as {__skewDb?: unknown}).__skewDb = device.db;
  Date.now = () => device.clock.now;
  try {
    return await action();
  } finally {
    Date.now = realNow;
  }
}

async function setup() {
  const real = {now: T0};
  const server = createFakeServer(() => real.now);
  const a = await createDevice(server, UID, {now: T0});
  const b = await createDevice(server, UID, {now: T0});
  return {real, server, a, b};
}

const nameOn = async (d: Device, id: string) =>
  (await d.db.getFirstAsync<{habitName: string}>('SELECT habitName FROM habits WHERE habitId = ?', [id]))?.habitName;
const completedOn = async (d: Device, id: string, date: string) =>
  (await d.db.getFirstAsync<{completed: number}>('SELECT completed FROM completions WHERE habitId = ? AND date = ?', [id, date]))?.completed;

describe('S-1: an edit made on a phone whose clock is behind', () => {
  test('one phone, clock moved back 2 hours after a synced edit: the next edit still reaches the server', {
    todo: 'S-1: the edit is stamped older than the phone\'s own earlier push, so the next pull\'s merge keeps the server copy and the edit is silently replaced (fix: updatedAt = max(now, row.updatedAt + 1))',
  }, async () => {
    const {server, a} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    a.clock.now = T0 + 10 * MIN - 2 * HOUR;// ten minutes later, but the clock now says two hours earlier
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read more')));
    await a.engine.requestSync();
    assert.deepEqual(server.rejections, [], 'the server refused the edit');
    assert.equal(server.get(UID, 'habits', id)?.habitName, 'Read more');
  });

  test('two phones, B one hour behind, B renames after pulling A\'s habit: A gets the rename', {
    todo: 'S-1: B stamps an older updatedAt than the copy it pulled, so the rules refuse its push ("updatedAt went back") and A never sees the rename',
  }, async () => {
    const {server, a, b} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    b.clock.now = T0 + 5 * MIN - HOUR;
    await b.engine.requestSync();// pulls Read
    b.clock.now = T0 + 10 * MIN - HOUR;
    await onPhone(b, () => habits.updateHabit(UID, id, input('Read daily')));
    await b.engine.requestSync();
    a.clock.now = T0 + 20 * MIN;
    await a.engine.requestSync();
    assert.equal(server.get(UID, 'habits', id)?.habitName, 'Read daily');
    assert.equal(await nameOn(a, id), 'Read daily');
  });

  test('two phones, B one hour behind, B un-ticks today after pulling A\'s tick: the un-tick reaches A', {
    todo: 'S-1: the same for a completion: B\'s un-tick carries an older updatedAt, the rules refuse it, and A stays ticked',
  }, async () => {
    const {server, a, b} = await setup();
    const today = getLocalDateString();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    await a.engine.requestSync();
    b.clock.now = T0 + 5 * MIN - HOUR;
    await b.engine.requestSync();
    b.clock.now = T0 + 10 * MIN - HOUR;
    await onPhone(b, () => completions.toggleCompletion(UID, id, false));
    await b.engine.requestSync();
    await a.engine.requestSync();
    assert.equal(server.get(UID, 'completions', `${id}_${today}`)?.completed, 0);
    assert.equal(await completedOn(a, id, today), 0);
  });
});

describe('S-1: the documented last-write-wins limit across phones (holds today and after the fix)', () => {
  test('B (clock behind) edits before it has pulled A\'s newer edit: A\'s edit wins on both phones and they agree', async () => {
    const {server, a, b} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    await b.engine.requestSync();// both have Read at T0
    a.clock.now = T0 + 20 * MIN;
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read at night')));
    await a.engine.requestSync();
    b.clock.now = T0 + 30 * MIN - HOUR;// later in real time, but B has not pulled A's edit and its clock is behind
    await onPhone(b, () => habits.updateHabit(UID, id, input('Read at dawn')));
    await b.engine.requestSync();
    await b.engine.requestSync();
    await a.engine.requestSync();
    assert.equal(server.get(UID, 'habits', id)?.habitName, 'Read at night');
    assert.deepEqual([await nameOn(a, id), await nameOn(b, id)], ['Read at night', 'Read at night']);
  });
});
