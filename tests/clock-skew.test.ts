// S-1: a phone whose clock is wrong must not lose its own edits (docs/HABITQUEST_DESIGN.md, S-1). Through the real
// write paths (db/habits.js, db/completions.js, the monotonic stamp in db/stamp.js), the real engine
// (sync/engineCore.ts), merge (sync/merge.ts), the re-stamp step (db/syncCore.js restampFutureRows) and a fake
// Firestore that enforces the rules' update checks, including "at most a day ahead of server time".
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createDevice, createFakeServer, type Device} from './helpers/fake-firestore.ts';
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';

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
const syncCore = await import('../db/syncCore.js');
const {getLocalDateString} = await import('../utils/dates.ts');
const {clockLine} = await import('../utils/syncStatusLine.ts');
const {nextClockSuspectCycles} = await import('../sync/engineCore.ts');

const UID = 'uid-skew';
const OTHER = 'uid-other';
const T0 = 1_762_000_000_000;// real time when the story starts
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
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

type Row = {habitName: string; updatedAt: number; synced: number; deleted: number};
const habitRow = (d: Device | {db: TestDb}, id: string) => d.db.getFirstAsync<Row>('SELECT * FROM habits WHERE habitId = ?', [id]);
const nameOn = async (d: Device, id: string) => (await habitRow(d, id))?.habitName;
const completionRow = (d: Device | {db: TestDb}, id: string, date: string) =>
  d.db.getFirstAsync<{completed: number; updatedAt: number; synced: number}>('SELECT * FROM completions WHERE habitId = ? AND date = ?', [id, date]);

describe('S-1: an edit made on a phone whose clock is behind reaches the server', () => {
  test('one phone, clock moved back 2 hours after a synced edit: the next edit still reaches the server', async () => {
    const {server, a} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    a.clock.now = T0 + 10 * MIN - 2 * HOUR;// ten minutes later, but the clock now says two hours earlier
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read more')));
    await a.engine.requestSync();
    assert.deepEqual(server.rejections, [], 'the server refused the edit');
    assert.equal(server.get(UID, 'habits', id)?.habitName, 'Read more');
  });

  test('two phones, B one hour behind, B renames after pulling A\'s habit: A gets the rename', async () => {
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

  test('two phones, B one hour behind, B un-ticks today after pulling A\'s tick: the un-tick reaches A', async () => {
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
    assert.equal((await completionRow(a, id, today))?.completed, 0);
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

describe('S-1: the monotonic stamp at every stamping site', () => {
  test('two edits in the same millisecond: the second stamp is the first + 1', async () => {
    const {a} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read more')));
    assert.equal((await habitRow(a, id))?.updatedAt, T0 + 1);
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read most')));
    assert.equal((await habitRow(a, id))?.updatedAt, T0 + 2);
  });

  test('two toggles of today\'s completion in the same millisecond: + 1 each time', async () => {
    const {a} = await setup();
    const today = getLocalDateString();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    assert.equal((await completionRow(a, id, today))?.updatedAt, T0);
    await onPhone(a, () => completions.toggleCompletion(UID, id, false));
    assert.equal((await completionRow(a, id, today))?.updatedAt, T0 + 1);
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    assert.deepEqual(await completionRow(a, id, today), {habitId: id, date: today, completed: 1, updatedAt: T0 + 2, synced: 0});
  });

  test('clock moved back: the edit and the delete stamp the previous value + 1', async () => {
    const {a} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    a.clock.now = T0 - 3 * HOUR;
    await onPhone(a, () => habits.updateHabit(UID, id, input('Read more')));
    assert.equal((await habitRow(a, id))?.updatedAt, T0 + 1);
    await onPhone(a, () => habits.softDeleteHabit(UID, id));
    assert.deepEqual([(await habitRow(a, id))?.updatedAt, (await habitRow(a, id))?.deleted], [T0 + 2, 1]);
  });

  test('a new habit is stamped now; a tick over a system row (updatedAt 0) is stamped now', async () => {
    const {a} = await setup();
    const today = getLocalDateString();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    const row = await a.db.getFirstAsync<{createdAt: number; updatedAt: number}>('SELECT createdAt, updatedAt FROM habits WHERE habitId = ?', [id]);
    assert.deepEqual(row, {createdAt: T0, updatedAt: T0});
    await onPhone(a, () => completions.ensureTodayRows(UID));
    assert.equal((await completionRow(a, id, today))?.updatedAt, 0);
    a.clock.now = T0 + 7;
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    assert.equal((await completionRow(a, id, today))?.updatedAt, T0 + 7);
  });

  test('system rows keep updatedAt 0 and are never pushed', async () => {
    const {server, a} = await setup();
    const today = getLocalDateString();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => completions.ensureTodayRows(UID));
    await a.engine.requestSync();
    assert.deepEqual(await completionRow(a, id, today), {habitId: id, date: today, completed: 0, updatedAt: 0, synced: 0});
    assert.equal(server.get(UID, 'completions', `${id}_${today}`), undefined);
  });

  test('a pulled row keeps the remote updatedAt (a pull is not a stamp)', async () => {
    const {a, b} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    b.clock.now = T0 - 5 * HOUR;
    await b.engine.requestSync();
    assert.deepEqual([(await habitRow(b, id))?.updatedAt, (await habitRow(b, id))?.synced], [T0, 1]);
  });
});

describe('S-1: re-stamping rows stuck with a future updatedAt', () => {
  const H = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const NOW = T0;

  async function seeded() {
    const db = await createTestDatabase();
    const habit = (id: string, userId: string, updatedAt: number, synced: 0 | 1) => db.runAsync(
      `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
      VALUES (?, ?, 'Read', 'book', 'daily', NULL, 'user', 1, ?, 0, ?)`, [id, userId, updatedAt, synced]);
    const completion = (id: string, date: string, updatedAt: number, synced: 0 | 1) => db.runAsync(
      'INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, 1, ?, ?)', [id, date, updatedAt, synced]);
    return {db, habit, completion};
  }
  const stamps = (db: TestDb, table: string) => db.getAllAsync<{updatedAt: number}>(`SELECT updatedAt FROM ${table} ORDER BY rowid`)
    .then((rows) => rows.map((r) => r.updatedAt));

  test('this uid\'s unsynced habits and completions more than a day ahead are re-stamped to now', async () => {
    const {db, habit, completion} = await seeded();
    await habit(H(1), UID, NOW + 3 * DAY, 0);
    await completion(H(1), '2026-11-01', NOW + 3 * DAY, 0);
    assert.deepEqual(await syncCore.restampFutureRows(db, UID, () => NOW), {habits: 1, completions: 1});
    assert.deepEqual([await stamps(db, 'habits'), await stamps(db, 'completions')], [[NOW], [NOW]]);
  });

  test('synced rows are never touched, even with a future updatedAt', async () => {
    const {db, habit, completion} = await seeded();
    await habit(H(1), UID, NOW + 3 * DAY, 1);
    await completion(H(1), '2026-11-01', NOW + 3 * DAY, 1);
    assert.deepEqual(await syncCore.restampFutureRows(db, UID, () => NOW), {habits: 0, completions: 0});
    assert.deepEqual([await stamps(db, 'habits'), await stamps(db, 'completions')], [[NOW + 3 * DAY], [NOW + 3 * DAY]]);
  });

  test('another user\'s rows are never touched', async () => {
    const {db, habit, completion} = await seeded();
    await habit(H(2), OTHER, NOW + 3 * DAY, 0);
    await completion(H(2), '2026-11-01', NOW + 3 * DAY, 0);
    assert.deepEqual(await syncCore.restampFutureRows(db, UID, () => NOW), {habits: 0, completions: 0});
    assert.deepEqual([await stamps(db, 'habits'), await stamps(db, 'completions')], [[NOW + 3 * DAY], [NOW + 3 * DAY]]);
  });

  test('boundaries: exactly a day ahead is left alone, and so are system rows (0)', async () => {
    const {db, habit, completion} = await seeded();
    await habit(H(1), UID, NOW + DAY, 0);
    await completion(H(1), '2026-11-01', NOW + DAY, 0);
    await completion(H(1), '2026-11-02', 0, 0);
    await completion(H(1), '2026-11-03', NOW + DAY + 1, 0);
    assert.deepEqual(await syncCore.restampFutureRows(db, UID, () => NOW), {habits: 0, completions: 1});
    assert.deepEqual(await stamps(db, 'completions'), [NOW + DAY, 0, NOW]);
  });

  test('the app\'s store (db/sync.js) provides the re-stamp the engine treats as optional, through the write queue', async () => {
    const appStore = await import('../db/sync.js');
    const {db, habit} = await seeded();
    await habit(H(1), UID, NOW + 3 * DAY, 0);
    (globalThis as {__skewDb?: unknown}).__skewDb = db;
    assert.equal(typeof appStore.restampFutureRows, 'function');
    assert.deepEqual(await appStore.restampFutureRows(UID, () => NOW), {habits: 1, completions: 0});
    assert.deepEqual(await stamps(db, 'habits'), [NOW]);
  });

  test('guarded: a push with no dirty row more than a day ahead runs no re-stamp at all', async () => {
    const {a} = await setup();
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    await a.engine.requestSync();
    assert.equal(a.calls.restamp, 0);
  });

  test('end to end: edits made with the clock 3 days ahead are refused; once the clock is fixed they are re-stamped and pushed', async () => {
    const {server, a, b} = await setup();
    const today = getLocalDateString();
    a.clock.now = T0 + 3 * DAY;
    const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await onPhone(a, () => completions.toggleCompletion(UID, id, true));
    await a.engine.requestSync();
    assert.equal(server.get(UID, 'habits', id), undefined, 'refused while the clock is ahead');
    a.clock.now = T0 + 10 * MIN;// the clock is fixed
    await a.engine.requestSync();
    assert.equal(a.calls.restamp, 1);
    assert.deepEqual([server.get(UID, 'habits', id)?.updatedAt, server.get(UID, 'completions', `${id}_${today}`)?.updatedAt],
      [T0 + 10 * MIN, T0 + 10 * MIN]);
    assert.deepEqual([(await habitRow(a, id))?.synced, (await completionRow(a, id, today))?.synced], [1, 1]);
    await b.engine.requestSync();
    assert.equal(await nameOn(b, id), 'Read');
  });

  test('an edit queued just before or just after the re-stamp keeps its content and is pushed', async () => {
    for (const order of ['edit first', 'restamp first'] as const) {
      const {server, a} = await setup();
      a.clock.now = T0 + 3 * DAY;
      const id = await onPhone(a, () => habits.addHabit(UID, input('Read')));
      a.clock.now = T0 + 10 * MIN;
      const edit = () => onPhone(a, () => habits.updateHabit(UID, id, input('Read more')));
      const restamp = () => a.store.restampFutureRows(UID, () => a.clock.now);
      if (order === 'edit first') await Promise.all([edit(), restamp()]);
      else await Promise.all([restamp(), edit()]);
      await a.engine.requestSync();
      assert.equal(server.get(UID, 'habits', id)?.habitName, 'Read more', order);
      assert.deepEqual([(await habitRow(a, id))?.habitName, (await habitRow(a, id))?.synced], ['Read more', 1], order);
    }
  });
});

describe('S-1: "clock suspect" and the Settings line', () => {
  test('clock 2 days ahead: cycle 1 marks it (hidden), cycle 2 shows the line; a fixed clock and an accepted push hide it', async () => {
    const {a} = await setup();
    a.clock.now = T0 + 2 * DAY;
    await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 1);
    assert.equal(clockLine(a.engine.getStatus()), null);
    await a.engine.requestSync();// the refused row waits out its backoff; no write is accepted
    assert.equal(a.engine.getStatus().clockSuspectCycles, 2);
    assert.match(clockLine(a.engine.getStatus()) ?? '', /^Backup paused/);
    a.clock.now = T0 + 20 * MIN;
    await a.engine.requestSync();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 0);
    assert.equal(clockLine(a.engine.getStatus()), null);
  });

  test('not suspect when the pull did not reach the end, or when the refused row was stamped more than a day ago', async () => {
    const {server, a} = await setup();
    server.refuse = () => 'refused for another reason';
    server.failPull = true;
    await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 0, 'pull did not reach the end');

    const second = await setup();
    second.server.refuse = () => 'refused for another reason';
    second.a.clock.now = T0 - 2 * DAY;
    await onPhone(second.a, () => habits.addHabit(UID, input('Read')));
    second.a.clock.now = T0;
    await second.a.engine.requestSync();
    assert.equal(second.a.engine.getStatus().clockSuspectCycles, 0, 'stamped more than a day ago');
  });

  test('stop() and start() (sign-out, another uid) reset the counter', async () => {
    const {a} = await setup();
    a.clock.now = T0 + 2 * DAY;
    await onPhone(a, () => habits.addHabit(UID, input('Read')));
    await a.engine.requestSync();
    await a.engine.requestSync();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 2);
    a.engine.stop();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 0);
    a.engine.start();
    assert.equal(a.engine.getStatus().clockSuspectCycles, 0);
  });

  test('the counter rule: success resets, a suspect cycle counts, offline cycles change nothing', () => {
    const base = {reachedPush: true, failed: false, pushedOk: false, suspect: false};
    assert.equal(nextClockSuspectCycles(3, {...base, pushedOk: true, suspect: true}), 0);
    assert.equal(nextClockSuspectCycles(0, {...base, suspect: true}), 1);
    assert.equal(nextClockSuspectCycles(1, base), 2);
    assert.equal(nextClockSuspectCycles(0, base), 0);
    assert.equal(nextClockSuspectCycles(1, {...base, reachedPush: false}), 1);
    assert.equal(nextClockSuspectCycles(1, {...base, failed: true}), 1);
  });
});
