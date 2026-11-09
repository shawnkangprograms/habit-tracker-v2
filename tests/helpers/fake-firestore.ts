/// <reference types="node" />
// Test-only: a fake Firestore server shared by several "devices", each with its own node:sqlite database (the real
// migration), the real sync store functions (db/syncCore.js), the real engine (sync/engineCore.ts) and its own clock.
// The server enforces what firestore.rules enforces on updates: updatedAt never goes back, a tombstone can't be undone,
// and updatedAt is at most one day ahead of server time. Adapted from the harness in tests/sync-engine.test.ts (left
// unchanged there); the model-based tests (docs/TEST_STRATEGY.md, Part D) reuse this one.

import {createTestDatabase, type TestDb} from './sqlite-adapter.ts';
// The app's one write queue: user writes (db/habits.js, db/completions.js) and sync writes interleave exactly as in
// the app. Devices share it in tests, which only serialises them further.
import {enqueueWrite} from '../../db/writeQueue.js';

type PullCollection = 'habits' | 'completions';
type Ts = {seconds: number; nanoseconds: number};
type ServerDoc = {id: string; data: Record<string, unknown>; ts: Ts};
type Cursor = {seconds: number; nanoseconds: number; docId: string};

const fail = (code: string) => Object.assign(new Error(code), {code});

export function createFakeServer(serverNow: () => number) {
  let tick = 0;
  const collections = new Map<string, Map<string, ServerDoc>>();
  const col = (uid: string, name: PullCollection) => {
    const key = `${uid}/${name}`;
    if (!collections.has(key)) collections.set(key, new Map());
    return collections.get(key)!;
  };
  const after = (d: ServerDoc, c: Cursor) =>
    d.ts.seconds !== c.seconds ? d.ts.seconds > c.seconds : d.ts.nanoseconds !== c.nanoseconds ? d.ts.nanoseconds > c.nanoseconds : d.id > c.docId;
  const rejections: {uid: string; id: string; reason: string}[] = [];
  const server = {
    rejections,
    // test switches: refuse a write for another reason (a string), or fail every pull with a permanent error
    refuse: null as ((data: Record<string, unknown>) => string | null) | null,
    failPull: false,
    get: (uid: string, name: PullCollection, id: string) => col(uid, name).get(id)?.data,
    commit(uid: string, name: PullCollection, items: {id: string; data: Record<string, unknown>}[]) {
      for (const {id, data} of items) {
        const stored = col(uid, name).get(id)?.data;
        const reason = server.refuse?.(data) ?? ((data.updatedAt as number) > serverNow() + 86_400_000 ? 'updatedAt more than a day ahead'
          : stored && (stored.updatedAt as number) > (data.updatedAt as number) ? 'updatedAt went back'
            : stored && stored.deleted === true && data.deleted === false ? 'undelete' : null);
        if (reason) {
          rejections.push({uid, id, reason});
          throw fail('permission-denied');
        }
      }
      tick += 1;
      const ts = {seconds: 1_700_000_000 + tick, nanoseconds: 0};
      for (const {id, data} of items) col(uid, name).set(id, {id, data, ts});
    },
    page(uid: string, name: PullCollection, cursor: Cursor | null, pageSize: number) {
      if (server.failPull) throw fail('permission-denied');
      return [...col(uid, name).values()]
        .sort((a, b) => a.ts.seconds - b.ts.seconds || (a.id < b.id ? -1 : 1))
        .filter((d) => !cursor || after(d, cursor))
        .slice(0, pageSize);
    },
  };
  return server;
}
export type FakeServer = ReturnType<typeof createFakeServer>;

// One phone: its database, its clock and its sync engine, for one signed-in uid
export async function createDevice(server: FakeServer, uid: string, clock: {now: number}) {
  const core = await import('../../db/syncCore.js');
  const {createSyncEngine} = await import('../../sync/engineCore.ts');
  const {createCursorStore} = await import('../../sync/cursorStore.ts');
  const db: TestDb = await createTestDatabase();
  const queue = enqueueWrite;
  const storage = new Map<string, string>();
  const calls = {restamp: 0};
  const store = {
    restampFutureRows: (u: string, now: () => number) => {
      calls.restamp += 1;
      return queue(() => core.restampFutureRows(db, u, now));
    },
    getDirtyHabits: (u: string) => core.getDirtyHabits(db, u),
    getDirtyCompletions: (u: string) => core.getDirtyCompletions(db, u),
    markHabitSynced: (u: string, id: string, at: number) => queue(() => core.markHabitSynced(db, u, id, at)),
    markCompletionSynced: (u: string, id: string, date: string, at: number) => queue(() => core.markCompletionSynced(db, u, id, date, at)),
    applyRemoteHabits: (u: string, habits: never[]) => queue(() => core.applyRemoteHabits(db, u, habits)),
    applyRemoteCompletions: (u: string, rows: never[]) => queue(() => core.applyRemoteCompletions(db, u, rows)),
  };
  const remote = {
    probe: async () => {},
    writeHabits: async (u: string, items: {habitId: string; doc: Record<string, unknown>}[]) =>
      server.commit(u, 'habits', items.map((i) => ({id: i.habitId, data: {...i.doc}}))),
    writeCompletions: async (u: string, items: {docId: string; doc: Record<string, unknown>}[]) =>
      server.commit(u, 'completions', items.map((i) => ({id: i.docId, data: {...i.doc}}))),
    pullPage: async (u: string, collection: PullCollection, after: Cursor | null, pageSize: number) => ({
      docs: server.page(u, collection, after, pageSize).map((d) => ({id: d.id, data: {...d.data}, cursor: {...d.ts, docId: d.id}})),
    }),
  };
  const cursors = createCursorStore({
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  }, 1);
  const engine = createSyncEngine({
    getUid: () => uid, store: store as never, remote: remote as never, cursors, onRemoteChange: () => {},
    now: () => clock.now, timeoutMs: 1000, debounceMs: 5,
  });
  engine.start();
  return {db, engine, clock, uid, store, calls};
}
export type Device = Awaited<ReturnType<typeof createDevice>>;
