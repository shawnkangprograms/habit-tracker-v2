// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';
import {createWriteQueue} from '../db/writeQueue.js';

const core = await import('../db/syncCore.js');
const {createSyncEngine} = await import('../sync/engineCore.ts');
type CompletionItem = import('../sync/engineCore.ts').CompletionItem;
type HabitItem = import('../sync/engineCore.ts').HabitItem;

const ME = 'uid-me';
const OTHER = 'uid-other';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (code: string) => Object.assign(new Error(code), {code});

type Call = {kind: 'probe' | 'habits' | 'completions'; uid: string; ids: string[]; items: (HabitItem | CompletionItem)[]};

// Fake Firestore. Every call first checks that no queued SQLite task is running: the engine must never
// call the network from inside (or while it still has) a queued write.
function createFakeRemote(queue: ReturnType<typeof createWriteQueue>) {
  const calls: Call[] = [];
  const violations: string[] = [];
  const fake = {
    calls,
    violations,
    probeError: null as Error | null,
    hang: null as Call['kind'] | null, // never settle calls of this kind
    failWith: null as ((call: Call) => Error | null) | null,
    duringWrite: null as ((call: Call) => Promise<void>) | null, // runs while the "network" is busy
    async handle(call: Call) {
      if (queue.pendingCount() !== 0) violations.push(`${call.kind} called while the write queue was busy`);
      calls.push(call);
      if (fake.hang === call.kind) await new Promise(() => {});
      if (fake.duringWrite) await fake.duringWrite(call);
      const err = fake.failWith?.(call);
      if (err) throw err;
    },
    remote: {
      probe: (uid: string) => {
        if (queue.pendingCount() !== 0) violations.push('probe called while the write queue was busy');
        calls.push({kind: 'probe', uid, ids: [], items: []});
        if (fake.hang === 'probe') return new Promise<void>(() => {});
        return fake.probeError ? Promise.reject(fake.probeError) : Promise.resolve();
      },
      writeHabits: (uid: string, items: HabitItem[]) =>
        fake.handle({kind: 'habits', uid, ids: items.map((i) => i.habitId), items}),
      writeCompletions: (uid: string, items: CompletionItem[]) =>
        fake.handle({kind: 'completions', uid, ids: items.map((i) => i.docId), items}),
    },
  };
  return fake;
}

async function createHarness(options: {timeoutMs?: number; debounceMs?: number} = {}) {
  const db = await createTestDatabase();
  const queue = createWriteQueue();
  const fake = createFakeRemote(queue);
  const state = {uid: ME as string | null, clock: 1_000_000};
  // the app's db/sync.js shape: reads unqueued, marks through the queue
  const store = {
    getDirtyHabits: (uid: string) => core.getDirtyHabits(db, uid),
    getDirtyCompletions: (uid: string) => core.getDirtyCompletions(db, uid),
    markHabitSynced: (uid: string, habitId: string, at: number) => queue(() => core.markHabitSynced(db, uid, habitId, at)),
    markCompletionSynced: (uid: string, habitId: string, date: string, at: number) =>
      queue(() => core.markCompletionSynced(db, uid, habitId, date, at)),
  };
  const engine = createSyncEngine({
    getUid: () => state.uid,
    store,
    remote: fake.remote,
    now: () => state.clock,
    timeoutMs: options.timeoutMs ?? 1000,
    debounceMs: options.debounceMs ?? 20,
  });
  engine.start();
  return {db, queue, fake, state, engine};
}

async function seedHabit(db: TestDb, habitId: string, over: {userId?: string; updatedAt?: number; days?: string[]; synced?: 0 | 1} = {}) {
  const days = over.days ?? [];
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, 'Read', 'book', ?, NULL, 'user', 1000, ?, 0, ?)`,
    [habitId, over.userId ?? ME, days.length ? 'weekdays' : 'daily', over.updatedAt ?? 2000, over.synced ?? 0],
  );
  for (const day of days) await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [habitId, day]);
}

async function seedCompletion(db: TestDb, habitId: string, date: string, completed: 0 | 1, updatedAt: number) {
  await db.runAsync(
    'INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, ?, ?, 0)',
    [habitId, date, completed, updatedAt],
  );
}

const synced = async (db: TestDb, sql: string, params: (string | number)[]) =>
  (await db.getFirstAsync<{synced: number}>(sql, params))?.synced;
const habitSynced = (db: TestDb, id: string) => synced(db, 'SELECT synced FROM habits WHERE habitId = ?', [id]);
const completionSynced = (db: TestDb, id: string, date: string) =>
  synced(db, 'SELECT synced FROM completions WHERE habitId = ? AND date = ?', [id, date]);

describe('push cycle', () => {
  test('pushes habits then completions with the locked doc shapes, and marks them synced', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {days: ['fri', 'mon']});
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    await seedCompletion(h.db, H1, '2026-10-21', 0, 0); // system row: never pushed

    await h.engine.requestSync();

    assert.deepEqual(h.fake.calls.map((c) => c.kind), ['probe', 'habits', 'completions']);
    const habitDoc = (h.fake.calls[1].items[0] as HabitItem).doc;
    assert.equal('userId' in habitDoc, false);
    assert.deepEqual(habitDoc.days, ['mon', 'fri']);
    const completion = h.fake.calls[2].items[0] as CompletionItem;
    assert.equal(completion.docId, `${H1}_2026-10-20`);
    assert.deepEqual(completion.doc, {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500});
    assert.deepEqual(h.fake.calls[2].ids, [`${H1}_2026-10-20`]);

    assert.equal(await habitSynced(h.db, H1), 1);
    assert.equal(await completionSynced(h.db, H1, '2026-10-20'), 1);
    assert.equal(await completionSynced(h.db, H1, '2026-10-21'), 0); // system row untouched

    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.pendingCount, s.lastErrorKind, s.rejectedCount], ['idle', 0, null, 0]);
    assert.equal(s.lastSuccessAt, h.state.clock);
    assert.deepEqual(h.fake.violations, []);
  });

  test("only this uid's rows are pushed, under this uid", async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    await seedHabit(h.db, H2, {userId: OTHER});
    await h.engine.requestSync();
    const habitCalls = h.fake.calls.filter((c) => c.kind === 'habits');
    assert.deepEqual(habitCalls.map((c) => [c.uid, c.ids]), [[ME, [H1]]]);
    assert.equal(await habitSynced(h.db, H2), 0);
  });

  test('batches hold at most 450 docs', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1});
    for (let i = 0; i < 451; i++) {
      const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10); // test fixture dates only
      await seedCompletion(h.db, H1, date, 1, 100 + i);
    }
    await h.engine.requestSync();
    assert.deepEqual(h.fake.calls.filter((c) => c.kind === 'completions').map((c) => c.ids.length), [450, 1]);
    assert.equal(h.engine.getStatus().pendingCount, 0);
  });
});

describe('lock and triggers', () => {
  test('requests during a cycle run exactly one more cycle', async () => {
    const h = await createHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.fake.remote.probe = async () => {
      h.fake.calls.push({kind: 'probe', uid: ME, ids: [], items: []});
      await gate;
    };
    const first = h.engine.requestSync();
    void h.engine.requestSync();
    void h.engine.requestSync();
    void h.engine.requestSync();
    release();
    await first;
    assert.equal(h.fake.calls.filter((c) => c.kind === 'probe').length, 2);
  });

  test('local changes are debounced into one push after the last change', async () => {
    const h = await createHarness({debounceMs: 30});
    await seedHabit(h.db, H1);
    h.engine.notifyLocalChange();
    await sleep(10);
    h.engine.notifyLocalChange();
    await sleep(10);
    h.engine.notifyLocalChange();
    await sleep(80);
    assert.equal(h.fake.calls.filter((c) => c.kind === 'probe').length, 1);
    assert.equal(await habitSynced(h.db, H1), 1);
  });
});

describe('abort', () => {
  test('a uid change during a batch: nothing is marked and nothing more is written', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    h.fake.duringWrite = async (call) => {
      if (call.kind === 'habits') h.state.uid = OTHER; // account switched while the batch was in flight
    };
    await h.engine.requestSync();
    assert.equal(await habitSynced(h.db, H1), 0);
    assert.equal(h.fake.calls.some((c) => c.kind === 'completions'), false);
    assert.equal(h.fake.calls.some((c) => c.uid === OTHER), false);
  });

  test('stop() during a cycle aborts it and turns the status off', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    h.fake.duringWrite = async () => h.engine.stop();
    await h.engine.requestSync();
    assert.equal(await habitSynced(h.db, H1), 0);
    assert.equal(h.engine.getStatus().state, 'off');
    await h.engine.requestSync(); // stopped: does nothing
    assert.equal(h.fake.calls.filter((c) => c.kind === 'probe').length, 1);
  });
});

describe('failures', () => {
  test('probe failure: no writes, state offline, nothing rejected', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    h.fake.probeError = fail('permission-denied'); // even a rules error on the probe is just "offline"
    await h.engine.requestSync();
    assert.deepEqual(h.fake.calls.map((c) => c.kind), ['probe']);
    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.lastErrorKind, s.rejectedCount, s.pendingCount], ['offline', 'offline', 0, 1]);
  });

  test('timeout: the cycle stops as transient and rows stay unsynced', async () => {
    const h = await createHarness({timeoutMs: 20});
    await seedHabit(h.db, H1);
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    h.fake.hang = 'habits';
    await h.engine.requestSync();
    assert.equal(await habitSynced(h.db, H1), 0);
    assert.equal(h.fake.calls.some((c) => c.kind === 'completions'), false);
    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.lastErrorKind, s.rejectedCount, s.pendingCount], ['offline', 'timeout', 0, 2]);
  });

  test('unauthenticated ends the cycle with kind auth', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    h.fake.failWith = () => fail('unauthenticated');
    await h.engine.requestSync();
    assert.equal(h.engine.getStatus().lastErrorKind, 'auth');
    assert.equal(await habitSynced(h.db, H1), 0);
  });

  test('partial batch rejection: one-by-one retry; the bad doc is skipped, the rest are synced', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    await seedHabit(h.db, H2, {updatedAt: 2500});
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    h.fake.failWith = (call) => (call.kind === 'habits' && call.ids.includes(H2) ? fail('permission-denied') : null);
    await h.engine.requestSync();

    assert.deepEqual(h.fake.calls.filter((c) => c.kind === 'habits').map((c) => c.ids),
      [[H1, H2], [H1], [H2]]);
    assert.equal(await habitSynced(h.db, H1), 1);
    assert.equal(await habitSynced(h.db, H2), 0);
    assert.equal(await completionSynced(h.db, H1, '2026-10-20'), 1); // completions still pushed
    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.lastErrorKind, s.rejectedCount, s.pendingCount], ['idle', 'rejected', 1, 1]);
    assert.deepEqual(h.fake.violations, []);
  });

  test('a transient error during the one-by-one retry stops the cycle without recording rejections', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    h.fake.failWith = (call) => {
      if (call.kind !== 'habits') return null;
      return call.ids.length > 1 ? fail('permission-denied') : fail('unavailable');
    };
    await seedHabit(h.db, H2);
    await h.engine.requestSync();
    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.lastErrorKind, s.rejectedCount], ['offline', 'offline', 0]);
    assert.equal(h.fake.calls.some((c) => c.kind === 'completions'), false);
  });

  test('backoff: a rejected doc is not re-sent until its window passes, or at once after a new edit', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    h.fake.failWith = (call) => (call.ids.includes(H1) ? fail('permission-denied') : null);
    await h.engine.requestSync(); // batch + one-by-one: 2 writes, then rejected
    const writesOf = () => h.fake.calls.filter((c) => c.kind === 'habits').length;
    assert.equal(writesOf(), 2);

    await h.engine.requestSync(); // inside the 5-minute window: skipped
    assert.equal(writesOf(), 2);
    assert.equal(h.engine.getStatus().rejectedCount, 1);

    h.state.clock += 5 * 60_000; // window over: tried again (and rejected again, now for 15 minutes)
    await h.engine.requestSync();
    assert.equal(writesOf(), 4);
    await h.engine.requestSync();
    assert.equal(writesOf(), 4);

    await h.db.runAsync('UPDATE habits SET updatedAt = 3000 WHERE habitId = ?', [H1]); // the user edits it
    h.fake.failWith = null;
    await h.engine.requestSync();
    assert.equal(writesOf(), 5);
    assert.equal(await habitSynced(h.db, H1), 1);
    assert.equal(h.engine.getStatus().rejectedCount, 0);
  });
});

describe('races', () => {
  test('a tap during a push stays unsynced and goes out next cycle', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1});
    await seedCompletion(h.db, H1, '2026-10-21', 1, 500);
    h.fake.duringWrite = async (call) => {
      if (call.kind !== 'completions') return;
      h.fake.duringWrite = null;
      // the user un-ticks while the batch is in flight (a queued write, like toggleCompletion)
      await h.queue(() => h.db.runAsync(
        'UPDATE completions SET completed = 0, updatedAt = 600, synced = 0 WHERE habitId = ? AND date = ?',
        [H1, '2026-10-21'],
      ));
    };
    await h.engine.requestSync();
    assert.equal(await completionSynced(h.db, H1, '2026-10-21'), 0);
    assert.equal(h.engine.getStatus().pendingCount, 1);

    await h.engine.requestSync();
    const last = h.fake.calls.filter((c) => c.kind === 'completions').at(-1)!.items[0] as CompletionItem;
    assert.deepEqual([last.doc.completed, last.doc.updatedAt], [0, 600]);
    assert.equal(await completionSynced(h.db, H1, '2026-10-21'), 1);
  });

  test('no network call ever happens while a queued SQLite task is running', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    await seedHabit(h.db, H2);
    for (let i = 1; i <= 5; i++) await seedCompletion(h.db, H1, `2026-10-0${i}`, 1, 100 + i);
    h.fake.failWith = (call) => (call.ids.includes(H2) ? fail('permission-denied') : null); // one-by-one path too
    await h.engine.requestSync();
    await h.engine.requestSync();
    assert.ok(h.fake.calls.length >= 5);
    assert.deepEqual(h.fake.violations, []);
  });

  test('the queue-idle check itself works (a network call from inside a queued task is caught)', async () => {
    const h = await createHarness();
    await h.queue(() => h.fake.remote.probe(ME)); // the forbidden pattern, done on purpose
    assert.equal(h.fake.violations.length, 1);
  });
});
