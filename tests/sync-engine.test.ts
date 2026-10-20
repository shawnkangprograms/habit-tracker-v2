// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';
import {createWriteQueue} from '../db/writeQueue.js';

const core = await import('../db/syncCore.js');
const {createSyncEngine} = await import('../sync/engineCore.ts');
const {createCursorStore} = await import('../sync/cursorStore.ts');
type CompletionItem = import('../sync/engineCore.ts').CompletionItem;
type HabitItem = import('../sync/engineCore.ts').HabitItem;
type PullCollection = import('../sync/engineCore.ts').PullCollection;
type PullCursor = import('../sync/cursorStore.ts').PullCursor;
type LocalHabit = import('../sync/merge.ts').LocalHabit;
type LocalCompletion = import('../sync/merge.ts').LocalCompletion;

const ME = 'uid-me';
const OTHER = 'uid-other';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const H3 = '33333333-3333-4333-8333-333333333333';
const habitIdN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (code: string) => Object.assign(new Error(code), {code});

// ---------- Fake Firestore server (shared by devices) ----------

type Ts = {seconds: number; nanoseconds: number};
type ServerDoc = {id: string; data: Record<string, unknown>; ts: Ts};

function createFakeServer() {
  let tick = 0;
  const collections = new Map<string, Map<string, ServerDoc>>();
  const col = (uid: string, name: PullCollection) => {
    const key = `${uid}/${name}`;
    if (!collections.has(key)) collections.set(key, new Map());
    return collections.get(key)!;
  };
  const after = (d: ServerDoc, c: PullCursor) =>
    d.ts.seconds !== c.seconds ? d.ts.seconds > c.seconds
      : d.ts.nanoseconds !== c.nanoseconds ? d.ts.nanoseconds > c.nanoseconds
        : d.id > c.docId;

  const server = {
    nextTs(): Ts {
      tick += 1;
      return {seconds: 1_700_000_000 + tick, nanoseconds: 0};
    },
    put(uid: string, name: PullCollection, id: string, data: Record<string, unknown>, ts: Ts = server.nextTs()) {
      col(uid, name).set(id, {id, data, ts});
    },
    get: (uid: string, name: PullCollection, id: string) => col(uid, name).get(id),
    // a batch, like the rules: updatedAt must not go back, a tombstone can't be undone; all or nothing
    commit(uid: string, name: PullCollection, items: {id: string; data: Record<string, unknown>}[]) {
      for (const {id, data} of items) {
        const stored = col(uid, name).get(id)?.data;
        if (stored && (stored.updatedAt as number) > (data.updatedAt as number)) throw fail('permission-denied');
        if (stored && stored.deleted === true && data.deleted === false) throw fail('permission-denied');
      }
      const ts = server.nextTs(); // one commit time for the whole batch
      for (const {id, data} of items) col(uid, name).set(id, {id, data, ts});
    },
    page(uid: string, name: PullCollection, cursor: PullCursor | null, pageSize: number) {
      return [...col(uid, name).values()]
        .sort((a, b) => a.ts.seconds - b.ts.seconds || a.ts.nanoseconds - b.ts.nanoseconds || (a.id < b.id ? -1 : 1))
        .filter((d) => !cursor || after(d, cursor))
        .slice(0, pageSize);
    },
  };
  return server;
}
type FakeServer = ReturnType<typeof createFakeServer>;

// ---------- Fake remote (one per device) ----------

type CallKind = 'probe' | 'pull' | 'habits' | 'completions';
type Call = {kind: CallKind; uid: string; ids: string[]; items: (HabitItem | CompletionItem)[]; collection?: PullCollection; after?: PullCursor | null};

// Every call first checks that no queued SQLite task is running: the engine must never call the network
// from inside (or while it still has) a queued write.
function createFakeRemote(queue: ReturnType<typeof createWriteQueue>, server: FakeServer) {
  const calls: Call[] = [];
  const violations: string[] = [];
  const fake = {
    calls,
    violations,
    probeError: null as Error | null,
    hang: null as CallKind | null, // never settle calls of this kind
    failWith: null as ((call: Call) => Error | null) | null,
    duringCall: null as ((call: Call) => Promise<void>) | null, // runs while the "network" is busy
    async handle(call: Call) {
      if (queue.pendingCount() !== 0) violations.push(`${call.kind} called while the write queue was busy`);
      calls.push(call);
      if (fake.hang === call.kind) await new Promise(() => {});
      if (fake.duringCall) await fake.duringCall(call);
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
      writeHabits: async (uid: string, items: HabitItem[]) => {
        await fake.handle({kind: 'habits', uid, ids: items.map((i) => i.habitId), items});
        server.commit(uid, 'habits', items.map((i) => ({id: i.habitId, data: {...i.doc}})));
      },
      writeCompletions: async (uid: string, items: CompletionItem[]) => {
        await fake.handle({kind: 'completions', uid, ids: items.map((i) => i.docId), items});
        server.commit(uid, 'completions', items.map((i) => ({id: i.docId, data: {...i.doc}})));
      },
      pullPage: async (uid: string, collection: PullCollection, after: PullCursor | null, pageSize: number) => {
        await fake.handle({kind: 'pull', uid, ids: [], items: [], collection, after});
        const docs = server.page(uid, collection, after, pageSize);
        return {docs: docs.map((d) => ({id: d.id, data: {...d.data}, cursor: {...d.ts, docId: d.id}}))};
      },
    },
  };
  return fake;
}

// ---------- Harness: one device ----------

type HarnessOptions = {
  timeoutMs?: number; debounceMs?: number; pageSize?: number; server?: FakeServer;
  db?: TestDb; storage?: Map<string, string>; parserVersion?: number;
};

async function createHarness(options: HarnessOptions = {}) {
  const db = options.db ?? await createTestDatabase();
  const server = options.server ?? createFakeServer();
  const storage = options.storage ?? new Map<string, string>();
  const queue = createWriteQueue();
  const fake = createFakeRemote(queue, server);
  const state = {uid: ME as string | null, clock: 1_000_000, remoteChanges: 0};
  // the app's db/sync.js shape: reads unqueued, writes (mark / apply) through the queue
  const store = {
    getDirtyHabits: (uid: string) => core.getDirtyHabits(db, uid),
    getDirtyCompletions: (uid: string) => core.getDirtyCompletions(db, uid),
    markHabitSynced: (uid: string, habitId: string, at: number) => queue(() => core.markHabitSynced(db, uid, habitId, at)),
    markCompletionSynced: (uid: string, habitId: string, date: string, at: number) =>
      queue(() => core.markCompletionSynced(db, uid, habitId, date, at)),
    applyRemoteHabits: (uid: string, habits: LocalHabit[]) => queue(() => core.applyRemoteHabits(db, uid, habits)),
    applyRemoteCompletions: (uid: string, completions: LocalCompletion[]) =>
      queue(() => core.applyRemoteCompletions(db, uid, completions)),
  };
  const cursors = createCursorStore({
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => {
      storage.set(key, value);
    },
  }, options.parserVersion ?? 1);
  const engine = createSyncEngine({
    getUid: () => state.uid,
    store,
    remote: fake.remote,
    cursors,
    onRemoteChange: () => {
      state.remoteChanges += 1;
    },
    now: () => state.clock,
    timeoutMs: options.timeoutMs ?? 1000,
    debounceMs: options.debounceMs ?? 20,
    pageSize: options.pageSize,
  });
  engine.start();
  return {db, server, storage, queue, fake, state, engine, store};
}

const pushCalls = (h: {fake: {calls: Call[]}}) => h.fake.calls.filter((c) => c.kind === 'habits' || c.kind === 'completions');
const pullCalls = (h: {fake: {calls: Call[]}}, collection: PullCollection) =>
  h.fake.calls.filter((c) => c.kind === 'pull' && c.collection === collection);

// ---------- Local seeding and reading ----------

async function seedHabit(db: TestDb, habitId: string, over: {userId?: string; updatedAt?: number; days?: string[]; synced?: 0 | 1; habitName?: string} = {}) {
  const days = over.days ?? [];
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, ?, 'book', ?, NULL, 'user', 1000, ?, 0, ?)`,
    [habitId, over.userId ?? ME, over.habitName ?? 'Read', days.length ? 'weekdays' : 'daily', over.updatedAt ?? 2000, over.synced ?? 0],
  );
  for (const day of days) await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [habitId, day]);
}

async function seedCompletion(db: TestDb, habitId: string, date: string, completed: 0 | 1, updatedAt: number, synced: 0 | 1 = 0) {
  await db.runAsync(
    'INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, ?, ?, ?)',
    [habitId, date, completed, updatedAt, synced],
  );
}

type HabitRow = {userId: string; habitName: string; updatedAt: number; deleted: number; synced: number};
const habitRow = (db: TestDb, id: string) => db.getFirstAsync<HabitRow>('SELECT * FROM habits WHERE habitId = ?', [id]);
type CompletionRow = {completed: number; updatedAt: number; synced: number};
const completionRow = (db: TestDb, id: string, date: string) =>
  db.getFirstAsync<CompletionRow>('SELECT * FROM completions WHERE habitId = ? AND date = ?', [id, date]);
const habitSynced = async (db: TestDb, id: string) => (await habitRow(db, id))?.synced;
const completionSynced = async (db: TestDb, id: string, date: string) => (await completionRow(db, id, date))?.synced;
const countRows = async (db: TestDb, table: string) =>
  (await db.getFirstAsync<{n: number}>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
async function daysOf(db: TestDb, id: string) {
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const rows = await db.getAllAsync<{day: string}>('SELECT day FROM habitDays WHERE habitId = ?', [id]);
  return rows.map((r) => r.day).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// a habit doc as stored in Firestore (without serverUpdatedAt)
const habitDoc = (over: Record<string, unknown> = {}) => ({
  habitName: 'Read', icon: 'book', frequencyType: 'daily', days: [], reminderTime: null, source: 'user',
  createdAt: 1000, updatedAt: 2000, deleted: false, ...over,
});

// =====================================================================
// PUSH (build stage 3)
// =====================================================================

describe('push cycle', () => {
  test('pushes habits then completions with the locked doc shapes, and marks them synced', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {days: ['fri', 'mon']});
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    await seedCompletion(h.db, H1, '2026-10-21', 0, 0); // system row: never pushed

    await h.engine.requestSync();

    assert.deepEqual(h.fake.calls.map((c) => c.kind), ['probe', 'pull', 'pull', 'habits', 'completions']);
    const habitCall = pushCalls(h)[0];
    const doc = (habitCall.items[0] as HabitItem).doc;
    assert.equal('userId' in doc, false);
    assert.deepEqual(doc.days, ['mon', 'fri']);
    const completion = pushCalls(h)[1].items[0] as CompletionItem;
    assert.equal(completion.docId, `${H1}_2026-10-20`);
    assert.deepEqual(completion.doc, {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500});
    assert.deepEqual(pushCalls(h)[1].ids, [`${H1}_2026-10-20`]);

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
    h.fake.duringCall = async (call) => {
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
    h.fake.duringCall = async (call) => {
      if (call.kind === 'habits') h.engine.stop();
    };
    await h.engine.requestSync();
    assert.equal(await habitSynced(h.db, H1), 0);
    assert.equal(h.engine.getStatus().state, 'off');
    await h.engine.requestSync(); // stopped: does nothing
    assert.equal(h.fake.calls.filter((c) => c.kind === 'probe').length, 1);
  });
});

describe('push failures', () => {
  test('probe failure: no pulls or writes, state offline, nothing rejected', async () => {
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
    h.fake.failWith = (call) => (call.kind === 'habits' ? fail('unauthenticated') : null);
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

    assert.deepEqual(h.fake.calls.filter((c) => c.kind === 'habits').map((c) => c.ids), [[H1, H2], [H1], [H2]]);
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
    await seedHabit(h.db, H2);
    await seedCompletion(h.db, H1, '2026-10-20', 1, 500);
    h.fake.failWith = (call) => {
      if (call.kind !== 'habits') return null;
      return call.ids.length > 1 ? fail('permission-denied') : fail('unavailable');
    };
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

describe('push races', () => {
  test('a tap during a push stays unsynced and goes out next cycle', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1});
    await seedCompletion(h.db, H1, '2026-10-21', 1, 500);
    h.fake.duringCall = async (call) => {
      if (call.kind !== 'completions') return;
      h.fake.duringCall = null;
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
});

// =====================================================================
// PULL (build stage 4)
// =====================================================================

describe('pull', () => {
  test('restore into an empty SQLite: habits, days, tombstones and completions; userId is the signed-in uid', async () => {
    const h = await createHarness();
    h.server.put(ME, 'habits', H1, habitDoc({frequencyType: 'weekdays', days: ['mon', 'fri'], updatedAt: 2000}));
    h.server.put(ME, 'habits', H2, habitDoc({deleted: true, updatedAt: 2100}));
    h.server.put(ME, 'completions', `${H1}_2026-10-20`, {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500});
    h.server.put(ME, 'completions', `${H2}_2026-10-19`, {habitId: H2, date: '2026-10-19', completed: 1, updatedAt: 600});

    assert.equal(h.engine.getStatus().initialPullDone, false);
    await h.engine.requestSync();

    assert.deepEqual([(await habitRow(h.db, H1))?.userId, (await habitRow(h.db, H1))?.synced], [ME, 1]);
    assert.deepEqual(await daysOf(h.db, H1), ['mon', 'fri']);
    assert.equal((await habitRow(h.db, H2))?.deleted, 1);
    assert.equal((await completionRow(h.db, H1, '2026-10-20'))?.completed, 1);
    assert.equal((await completionRow(h.db, H2, '2026-10-19'))?.synced, 1);
    assert.equal(pushCalls(h).length, 0); // nothing local to push

    const s = h.engine.getStatus();
    assert.equal(s.initialPullDone, true);
    assert.equal(s.lastPullAt, h.state.clock);
    assert.deepEqual(s.pullCounts, {received: 4, invalid: 0, changed: 4});
    assert.ok(h.state.remoteChanges >= 1);
    assert.equal(JSON.parse(h.storage.get(`sync:${ME}`)!).initialPullDone, true);
    assert.deepEqual(h.fake.violations, []);
  });

  test('paging: 1001 docs sharing one timestamp come in pages of 500, and nothing is re-read next cycle', async () => {
    const h = await createHarness();
    const ts = h.server.nextTs(); // one batch: every doc has the same serverUpdatedAt
    for (let i = 1; i <= 1001; i++) h.server.put(ME, 'habits', habitIdN(i), habitDoc(), ts);

    await h.engine.requestSync();
    assert.equal(pullCalls(h, 'habits').length, 3); // 500 + 500 + 1
    assert.equal(await countRows(h.db, 'habits'), 1001);

    h.fake.calls.length = 0;
    await h.engine.requestSync();
    assert.equal(pullCalls(h, 'habits').length, 1);
    assert.equal(h.engine.getStatus().pullCounts.received, 0); // the cursor's doc id tie-break: no re-reads
  });

  test('the cursor advances only after the page has committed; the next cycle re-reads from there', async () => {
    const h = await createHarness({pageSize: 2});
    for (let i = 1; i <= 5; i++) h.server.put(ME, 'habits', habitIdN(i), habitDoc());
    const realApply = h.store.applyRemoteHabits;
    let applies = 0;
    h.store.applyRemoteHabits = async (uid, habits) => {
      applies += 1;
      if (applies === 2) throw new Error('disk full'); // the second page's transaction fails
      return realApply(uid, habits);
    };
    await seedHabit(h.db, H1); // a local change: still pushed despite the pull failure

    await h.engine.requestSync();
    assert.equal(await countRows(h.db, 'habits'), 3); // H1 + the first page
    assert.equal(h.engine.getStatus().pullError, 'unknown');
    assert.equal(await habitSynced(h.db, H1), 1);
    assert.equal(h.engine.getStatus().initialPullDone, false);

    h.fake.calls.length = 0;
    await h.engine.requestSync();
    assert.equal(pullCalls(h, 'habits')[0].after?.docId, habitIdN(2)); // resumes after the committed page
    assert.equal(await countRows(h.db, 'habits'), 6);
    assert.equal(h.engine.getStatus().initialPullDone, true);
  });

  test('a doc with an unknown icon is skipped and counted; later docs still apply; a parser bump re-pulls', async () => {
    const h = await createHarness();
    h.server.put(ME, 'habits', H1, habitDoc({icon: 'rocket'})); // from a newer app version
    h.server.put(ME, 'habits', H2, habitDoc());
    await h.engine.requestSync();
    assert.equal(await habitRow(h.db, H1), null);
    assert.ok(await habitRow(h.db, H2));
    assert.equal(h.engine.getStatus().pullCounts.invalid, 1);

    await h.engine.requestSync(); // the cursor moved past it: not re-read
    assert.equal(h.engine.getStatus().pullCounts.received, 0);

    // PARSER_VERSION bump on the same phone: everything is read once more
    const bumped = await createHarness({db: h.db, storage: h.storage, server: h.server, parserVersion: 2});
    await bumped.engine.requestSync();
    assert.equal(pullCalls(bumped, 'habits')[0].after, null);
    assert.equal(bumped.engine.getStatus().pullCounts.received, 2);
    assert.equal(bumped.engine.getStatus().initialPullDone, true); // no restore screen again
  });

  test('sticky delete from remote: a remote tombstone deletes the local habit', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1, updatedAt: 2000});
    h.server.put(ME, 'habits', H1, habitDoc({deleted: true, updatedAt: 2500}));
    await h.engine.requestSync();
    const row = await habitRow(h.db, H1);
    assert.deepEqual([row?.deleted, row?.synced, row?.updatedAt], [1, 1, 2500]);
  });

  test('two devices: the newer edit wins on both, and a newer local copy is pushed in the same cycle', async () => {
    const server = createFakeServer();
    const a = await createHarness({server});
    const b = await createHarness({server});

    await seedHabit(a.db, H1, {habitName: 'Original'});
    await a.engine.requestSync(); // A pushes H1
    await b.engine.requestSync(); // B restores H1
    assert.equal((await habitRow(b.db, H1))?.habitName, 'Original');

    // both edit offline; B's edit is newer, but A syncs first
    await a.db.runAsync(`UPDATE habits SET habitName = 'A edit', updatedAt = 3000, synced = 0 WHERE habitId = ?`, [H1]);
    await b.db.runAsync(`UPDATE habits SET habitName = 'B edit', updatedAt = 4000, synced = 0 WHERE habitId = ?`, [H1]);
    await a.engine.requestSync();
    assert.equal(server.get(ME, 'habits', H1)?.data.habitName, 'A edit');

    await b.engine.requestSync(); // pulls A's older edit: local wins, stays dirty, and is pushed
    assert.equal((await habitRow(b.db, H1))?.habitName, 'B edit');
    assert.equal(await habitSynced(b.db, H1), 1);
    assert.equal(server.get(ME, 'habits', H1)?.data.habitName, 'B edit');

    await a.engine.requestSync(); // A gets the newer edit
    assert.deepEqual([(await habitRow(a.db, H1))?.habitName, await habitSynced(a.db, H1)], ['B edit', 1]);
    assert.deepEqual([...a.fake.violations, ...b.fake.violations], []);
  });

  test('a tap during a pull is not overwritten by an older remote copy', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1});
    await seedCompletion(h.db, H1, '2026-10-21', 0, 0); // today's system row
    h.server.put(ME, 'completions', `${H1}_2026-10-21`, {habitId: H1, date: '2026-10-21', completed: 0, updatedAt: 600});
    h.fake.duringCall = async (call) => {
      if (call.kind !== 'pull' || call.collection !== 'completions') return;
      h.fake.duringCall = null;
      await h.queue(() => h.db.runAsync( // the user ticks while the page is being fetched
        'UPDATE completions SET completed = 1, updatedAt = 700, synced = 0 WHERE habitId = ? AND date = ?',
        [H1, '2026-10-21'],
      ));
    };
    await h.engine.requestSync();
    assert.deepEqual(await completionRow(h.db, H1, '2026-10-21'),
      {habitId: H1, date: '2026-10-21', completed: 1, updatedAt: 700, synced: 1}); // kept, then pushed
    assert.equal(h.server.get(ME, 'completions', `${H1}_2026-10-21`)?.data.completed, 1);
  });

  test('an account switch during a pull applies nothing and saves no cursor', async () => {
    const h = await createHarness();
    h.server.put(ME, 'habits', H1, habitDoc());
    h.fake.duringCall = async (call) => {
      if (call.kind === 'pull') h.state.uid = OTHER;
    };
    await h.engine.requestSync();
    assert.equal(await countRows(h.db, 'habits'), 0);
    assert.equal(h.storage.size, 0);
    assert.equal(h.state.remoteChanges, 0);
  });

  test("remote docs for a habitId that belongs to another local user are skipped", async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {userId: OTHER, habitName: 'Theirs', synced: 1});
    h.server.put(ME, 'habits', H1, habitDoc({habitName: 'Hijack', updatedAt: 9000}));
    h.server.put(ME, 'completions', `${H1}_2026-10-20`, {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500});
    await h.engine.requestSync();
    assert.deepEqual([(await habitRow(h.db, H1))?.userId, (await habitRow(h.db, H1))?.habitName], [OTHER, 'Theirs']);
    assert.equal(await completionRow(h.db, H1, '2026-10-20'), null);
    assert.equal(h.engine.getStatus().pullError, null);
  });

  test('a permanent pull failure still pushes local changes; a transient one stops the cycle', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1);
    h.fake.failWith = (call) => (call.kind === 'pull' ? fail('permission-denied') : null);
    await h.engine.requestSync();
    assert.equal(pullCalls(h, 'completions').length, 0); // habits pull failed: completions skipped
    assert.equal(await habitSynced(h.db, H1), 1);
    const s = h.engine.getStatus();
    assert.deepEqual([s.state, s.pullError, s.lastErrorKind, s.lastPullAt], ['idle', 'rejected', 'rejected', null]);

    const t = await createHarness();
    await seedHabit(t.db, H1);
    t.fake.failWith = (call) => (call.kind === 'pull' ? fail('unavailable') : null);
    await t.engine.requestSync();
    assert.equal(pushCalls(t).length, 0);
    assert.equal(t.engine.getStatus().state, 'offline');
  });

  test('onRemoteChange fires only for pages that changed local data', async () => {
    const h = await createHarness();
    await seedHabit(h.db, H1, {synced: 1, updatedAt: 2000});
    h.server.put(ME, 'habits', H1, habitDoc({updatedAt: 2000})); // identical to the local copy
    await h.engine.requestSync();
    assert.equal(h.state.remoteChanges, 0);

    h.server.put(ME, 'habits', H2, habitDoc());
    await h.engine.requestSync();
    assert.equal(h.state.remoteChanges, 1);
  });

  test('forceFullPull re-reads everything from the start', async () => {
    const h = await createHarness();
    h.server.put(ME, 'habits', H1, habitDoc());
    h.server.put(ME, 'habits', H3, habitDoc());
    await h.engine.requestSync();
    h.fake.calls.length = 0;
    await h.engine.forceFullPull();
    assert.equal(pullCalls(h, 'habits')[0].after, null);
    assert.equal(h.engine.getStatus().pullCounts.received, 2);
    assert.equal(h.engine.getStatus().initialPullDone, true);
  });
});

describe('queue rule', () => {
  test('no network call ever happens while a queued SQLite task is running (push and pull paths)', async () => {
    const h = await createHarness({pageSize: 2});
    await seedHabit(h.db, H1);
    await seedHabit(h.db, H2);
    for (let i = 1; i <= 5; i++) await seedCompletion(h.db, H1, `2026-10-0${i}`, 1, 100 + i);
    for (let i = 1; i <= 5; i++) h.server.put(ME, 'habits', habitIdN(i), habitDoc());
    h.fake.failWith = (call) => (call.ids.includes(H2) ? fail('permission-denied') : null); // one-by-one path too
    await h.engine.requestSync();
    await h.engine.requestSync();
    assert.ok(h.fake.calls.length >= 8);
    assert.deepEqual(h.fake.violations, []);
  });

  test('the queue-idle check itself works (a network call from inside a queued task is caught)', async () => {
    const h = await createHarness();
    await h.queue(() => h.fake.remote.probe(ME)); // the forbidden pattern, done on purpose
    assert.equal(h.fake.violations.length, 1);
  });
});
