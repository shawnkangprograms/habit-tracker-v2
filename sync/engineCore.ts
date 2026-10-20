// Sync engine (build stages 3-4): pure logic, every dependency passed in, so Node's test runner can drive
// it with a fake Firestore. sync/syncEngine.js connects the real pieces (Firestore, db/sync.js, auth, triggers).
//
// One cycle:
//   probe (is Firestore reachable?) -> PULL habits, then completions -> PUSH habits, then completions.
// Rules:
// - One cycle at a time. A request during a cycle runs exactly one more cycle afterwards.
// - The uid is captured at the start and re-checked before every batch/page and after every network
//   await; if it changed, or stop() was called, the cycle ends at once and nothing more is applied,
//   saved, marked or written.
// - Network calls never happen inside a queued SQLite task: dirty rows are plain reads, Firestore is
//   called outside the queue, and only the apply / mark-synced writes are queued, after the network call.
// - Pull: pages ordered by (serverUpdatedAt, doc id); each page is parsed (invalid docs skipped and
//   counted), applied in one queued SQLite transaction, and only THEN is the cursor saved. A habits pull
//   that fails skips the completions pull (foreign keys).
// - Transient failures (offline, timeout, auth, unknown) end the cycle; rows stay unsynced for next time.
//   A PERMANENT pull failure (rules, missing index) is recorded as pullError and the push still runs,
//   so local changes keep being backed up. Permanent push rejections retry that batch one doc at a time;
//   docs still rejected are skipped with a per-doc backoff (in memory), reset when updatedAt changes.

import {chunk, completionDocId, completionToDoc, docToCompletion, docToHabit, habitToDoc, isPushable} from '@/sync/merge';
import type {CompletionDoc, HabitDoc, LocalCompletion, LocalHabit} from '@/sync/merge';
import type {CursorState, PullCursor} from '@/sync/cursorStore';

export type HabitItem = {habitId: string; doc: HabitDoc};
export type CompletionItem = {docId: string; doc: CompletionDoc};
export type PullCollection = 'habits' | 'completions';
export type RemoteDoc = {id: string; data: unknown; cursor: PullCursor}; // data without serverUpdatedAt

export type SyncStore = {
  getDirtyHabits(uid: string): Promise<LocalHabit[]>;
  getDirtyCompletions(uid: string): Promise<LocalCompletion[]>;
  markHabitSynced(uid: string, habitId: string, pushedUpdatedAt: number): Promise<boolean>;
  markCompletionSynced(uid: string, habitId: string, date: string, pushedUpdatedAt: number): Promise<boolean>;
  applyRemoteHabits(uid: string, habits: LocalHabit[]): Promise<{written: number}>;
  applyRemoteCompletions(uid: string, completions: LocalCompletion[]): Promise<{applied: number}>;
};

// The Firestore side. Each write call is one batch; the adapter adds serverUpdatedAt.
export type SyncRemote = {
  probe(uid: string): Promise<void>;
  writeHabits(uid: string, items: HabitItem[]): Promise<void>;
  writeCompletions(uid: string, items: CompletionItem[]): Promise<void>;
  // up to pageSize docs after `after` (null = from the start), ordered by (serverUpdatedAt, doc id)
  pullPage(uid: string, collection: PullCollection, after: PullCursor | null, pageSize: number): Promise<{docs: RemoteDoc[]}>;
};

export type SyncCursors = {
  load(uid: string): Promise<CursorState>;
  save(uid: string, state: CursorState): Promise<void>;
};

export type ErrorKind = 'offline' | 'timeout' | 'auth' | 'rejected' | 'unknown';

export type SyncStatus = {
  state: 'off' | 'idle' | 'syncing' | 'offline';
  lastSuccessAt: number | null; // last cycle that ended without a transient failure
  lastAttemptAt: number | null;
  lastPullAt: number | null; // last time both collections were pulled to the end
  initialPullDone: boolean;
  pendingCount: number; // unsynced user rows after the last cycle (system rows excluded)
  lastErrorKind: ErrorKind | null;
  pullError: ErrorKind | null; // why the last pull stopped early, if it did (push may still have run)
  rejectedCount: number; // docs the rules rejected and that are waiting in backoff
  pullCounts: {received: number; invalid: number; changed: number}; // last cycle (dev log)
};

export type SyncEngineOptions = {
  getUid: () => string | null;
  store: SyncStore;
  remote: SyncRemote;
  cursors?: SyncCursors; // without cursors the engine is push-only (build stage 3)
  onRemoteChange?: () => void; // a pulled page changed local data
  now?: () => number; // for backoff and status times
  timeoutMs?: number; // per network call
  debounceMs?: number; // push after the last local change
  pageSize?: number; // docs per pull page
};

export const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export const PULL_PAGE_SIZE = 500;

const PERMANENT_CODES = ['permission-denied', 'invalid-argument', 'failed-precondition'];

const INITIAL_STATUS: SyncStatus = {
  state: 'off', lastSuccessAt: null, lastAttemptAt: null, lastPullAt: null, initialPullDone: false,
  pendingCount: 0, lastErrorKind: null, pullError: null, rejectedCount: 0,
  pullCounts: {received: 0, invalid: 0, changed: 0},
};

class Aborted extends Error {}

class CycleStop extends Error {
  kind: ErrorKind;
  constructor(kind: ErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

// The pull stopped early, but the push may still run
class PullStop extends Error {
  kind: ErrorKind;
  constructor(kind: ErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

function codeOf(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as {code: unknown}).code) : '';
}

// Transient failures map to a status kind; permanent ones return 'permanent'
export function classifyError(err: unknown): ErrorKind | 'permanent' {
  const code = codeOf(err);
  if (PERMANENT_CODES.includes(code)) return 'permanent';
  if (code === 'unavailable') return 'offline';
  if (code === 'deadline-exceeded' || code === 'timeout') return 'timeout';
  if (code === 'unauthenticated') return 'auth';
  return 'unknown';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Sync request timed out'), {code: 'timeout'})), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type Pending<T> = {key: string; updatedAt: number; item: T; mark: () => Promise<boolean>};
type Rejection = {updatedAt: number; failures: number; skipUntil: number};

export function createSyncEngine(options: SyncEngineOptions) {
  const {getUid, store, remote, cursors} = options;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const debounceMs = options.debounceMs ?? 3_000;
  const pageSize = options.pageSize ?? PULL_PAGE_SIZE;

  let status: SyncStatus = {...INITIAL_STATUS};
  const listeners = new Set<(s: SyncStatus) => void>();
  let stopped = true;
  let generation = 0; // bumped by start/stop, so a cycle from before can't continue
  let running: Promise<void> | null = null;
  let rerun = false;
  let resetRequested = false; // full re-pull at the start of the next cycle
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const rejected = new Map<string, Map<string, Rejection>>(); // uid -> doc key -> backoff

  function setStatus(patch: Partial<SyncStatus>) {
    status = {...status, ...patch};
    const snapshot = {...status};
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        // a status listener can never break sync
      }
    }
  }

  // ---------- Push: backoff for rejected docs ----------

  function rejectionsFor(uid: string): Map<string, Rejection> {
    let map = rejected.get(uid);
    if (!map) {
      map = new Map();
      rejected.set(uid, map);
    }
    return map;
  }

  // true while a rejected doc is waiting out its backoff; a changed row (new updatedAt) is tried at once
  function inBackoff(uid: string, key: string, updatedAt: number): boolean {
    const map = rejectionsFor(uid);
    const entry = map.get(key);
    if (!entry) return false;
    if (entry.updatedAt !== updatedAt) {
      map.delete(key);
      return false;
    }
    return now() < entry.skipUntil;
  }

  function recordRejection(uid: string, key: string, updatedAt: number) {
    const map = rejectionsFor(uid);
    const previous = map.get(key);
    const failures = previous && previous.updatedAt === updatedAt ? previous.failures + 1 : 1;
    const wait = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
    map.set(key, {updatedAt, failures, skipUntil: now() + wait});
  }

  // forget rejections for rows that are no longer dirty (synced, or overwritten)
  function pruneRejections(uid: string, dirtyKeys: Set<string>) {
    const map = rejectionsFor(uid);
    for (const key of [...map.keys()]) if (!dirtyKeys.has(key)) map.delete(key);
  }

  // ---------- Pull ----------

  type PullCounts = SyncStatus['pullCounts'];

  // Pulls one collection to its end, page by page. Returns the updated cursor state.
  async function pullCollection(
    uid: string,
    collection: PullCollection,
    state: CursorState,
    counts: PullCounts,
    check: () => void,
  ): Promise<CursorState> {
    const cursorKey = collection === 'habits' ? 'habitsCursor' : 'completionsCursor';
    const cursorStore = cursors!; // pull only runs when cursors were given
    let current = state;

    for (;;) {
      check();
      let page: {docs: RemoteDoc[]};
      try {
        page = await withTimeout(remote.pullPage(uid, collection, current[cursorKey], pageSize), timeoutMs);
      } catch (err) {
        check(); // a sign-out wins over any error
        const kind = classifyError(err);
        if (kind === 'permanent') throw new PullStop('rejected');
        throw new CycleStop(kind);
      }
      check();
      if (page.docs.length === 0) return current;
      counts.received += page.docs.length;

      // apply in one queued transaction; only then move the cursor
      let changed = 0;
      try {
        if (collection === 'habits') {
          const parsed = page.docs.map((d) => docToHabit(d.id, d.data)).filter((h): h is LocalHabit => h !== null);
          counts.invalid += page.docs.length - parsed.length;
          if (parsed.length > 0) changed = (await store.applyRemoteHabits(uid, parsed)).written;
        } else {
          const parsed = page.docs.map((d) => docToCompletion(d.id, d.data)).filter((c): c is LocalCompletion => c !== null);
          counts.invalid += page.docs.length - parsed.length;
          if (parsed.length > 0) changed = (await store.applyRemoteCompletions(uid, parsed)).applied;
        }
      } catch (err) {
        if (err instanceof Aborted) throw err;
        throw new PullStop('unknown'); // a local apply failure: the cursor stays, the push still runs
      }
      check();

      current = {...current, [cursorKey]: page.docs[page.docs.length - 1].cursor};
      try {
        await cursorStore.save(uid, current);
      } catch {
        // not saved: the page is re-read next cycle, which is harmless
      }
      check();

      if (changed > 0) {
        counts.changed += changed;
        try {
          options.onRemoteChange?.();
        } catch {
          // a listener can never break sync
        }
      }
      if (page.docs.length < pageSize) return current;
    }
  }

  // ---------- Push ----------

  async function pushPhase<T>(
    uid: string,
    pendings: Pending<T>[],
    write: (uid: string, items: T[]) => Promise<void>,
    check: () => void,
  ) {
    for (const batch of chunk(pendings)) {
      check();
      try {
        await withTimeout(write(uid, batch.map((p) => p.item)), timeoutMs);
      } catch (err) {
        check(); // a sign-out wins over any error
        const kind = classifyError(err);
        if (kind !== 'permanent') throw new CycleStop(kind);
        await pushOneByOne(uid, batch, write, check);
        continue;
      }
      check();
      for (const p of batch) {
        check();
        await p.mark(); // false = changed during the push: stays unsynced for the next cycle
      }
    }
  }

  async function pushOneByOne<T>(
    uid: string,
    batch: Pending<T>[],
    write: (uid: string, items: T[]) => Promise<void>,
    check: () => void,
  ) {
    for (const p of batch) {
      check();
      try {
        await withTimeout(write(uid, [p.item]), timeoutMs);
      } catch (err) {
        check();
        const kind = classifyError(err);
        if (kind !== 'permanent') throw new CycleStop(kind);
        recordRejection(uid, p.key, p.updatedAt);
        continue;
      }
      check();
      rejectionsFor(uid).delete(p.key);
      await p.mark();
    }
  }

  async function push(uid: string, check: () => void) {
    const habits = await store.getDirtyHabits(uid);
    check();
    const completions = (await store.getDirtyCompletions(uid)).filter((c) => isPushable(c.updatedAt));
    check();

    const habitKey = (habitId: string) => `h:${habitId}`;
    const completionKey = (c: LocalCompletion) => `c:${completionDocId(c.habitId, c.date)}`;
    pruneRejections(uid, new Set([...habits.map((h) => habitKey(h.habitId)), ...completions.map(completionKey)]));

    const habitPendings: Pending<HabitItem>[] = habits
      .filter((h) => !inBackoff(uid, habitKey(h.habitId), h.updatedAt))
      .map((h) => ({
        key: habitKey(h.habitId),
        updatedAt: h.updatedAt,
        item: {habitId: h.habitId, doc: habitToDoc(h)},
        mark: () => store.markHabitSynced(uid, h.habitId, h.updatedAt),
      }));
    const completionPendings: Pending<CompletionItem>[] = completions
      .filter((c) => !inBackoff(uid, completionKey(c), c.updatedAt))
      .map((c) => ({
        key: completionKey(c),
        updatedAt: c.updatedAt,
        item: {docId: completionDocId(c.habitId, c.date), doc: completionToDoc(c)},
        mark: () => store.markCompletionSynced(uid, c.habitId, c.date, c.updatedAt),
      }));

    // habits before completions
    await pushPhase(uid, habitPendings, (u, items) => remote.writeHabits(u, items), check);
    await pushPhase(uid, completionPendings, (u, items) => remote.writeCompletions(u, items), check);
  }

  async function countPending(uid: string): Promise<number> {
    const [habits, completions] = await Promise.all([store.getDirtyHabits(uid), store.getDirtyCompletions(uid)]);
    return habits.length + completions.filter((c) => isPushable(c.updatedAt)).length;
  }

  // ---------- Cycle ----------

  async function runCycle() {
    const uid = getUid();
    if (!uid) return;
    const myGeneration = generation;
    const isCurrent = () => !stopped && generation === myGeneration && getUid() === uid;
    const check = () => {
      if (!isCurrent()) throw new Aborted();
    };

    const counts: PullCounts = {received: 0, invalid: 0, changed: 0};
    setStatus({state: 'syncing', lastAttemptAt: now()});
    let failure: ErrorKind | null = null;
    let pullError: ErrorKind | null = null;
    let pulledToEnd = false;
    let state: CursorState | null = null;
    try {
      // local, so initialPullDone is known even when offline
      if (cursors) {
        state = await cursors.load(uid);
        check(); // every cursor save starts right after a check, so none can start after stop()
        if (resetRequested) {
          resetRequested = false;
          state = {...state, habitsCursor: null, completionsCursor: null};
          await cursors.save(uid, state);
          check();
        }
        setStatus({initialPullDone: state.initialPullDone});
      }

      try {
        await withTimeout(remote.probe(uid), timeoutMs);
      } catch {
        check();
        throw new CycleStop('offline'); // never a rejection: nothing was written
      }
      check();

      // PULL: habits fully before completions
      if (cursors && state) {
        try {
          state = await pullCollection(uid, 'habits', state, counts, check);
          state = await pullCollection(uid, 'completions', state, counts, check);
          pulledToEnd = true;
          if (!state.initialPullDone) {
            state = {...state, initialPullDone: true};
            check();
            try {
              await cursors.save(uid, state);
            } catch {
              // retried at the end of the next full pull
            }
            check();
          }
        } catch (err) {
          if (!(err instanceof PullStop)) throw err;
          pullError = err.kind; // permanent: skip the rest of the pull, still push
        }
      }

      // PUSH
      await push(uid, check);
    } catch (err) {
      if (err instanceof Aborted) {
        setStatus({state: stopped ? 'off' : 'idle'});
        return;
      }
      failure = err instanceof CycleStop ? err.kind : 'unknown';
    }

    let pendingCount = status.pendingCount;
    try {
      pendingCount = await countPending(uid);
    } catch {
      // keep the previous count
    }
    if (!isCurrent()) return;

    const rejectedCount = rejectionsFor(uid).size;
    const pullPatch = {
      pullCounts: counts,
      pullError,
      initialPullDone: state?.initialPullDone ?? status.initialPullDone,
      ...(pulledToEnd ? {lastPullAt: now()} : {}),
    };
    if (failure === null) {
      setStatus({
        ...pullPatch,
        state: 'idle', lastSuccessAt: now(), pendingCount, rejectedCount,
        lastErrorKind: rejectedCount > 0 ? 'rejected' : pullError,
      });
    } else {
      setStatus({
        ...pullPatch,
        state: failure === 'offline' || failure === 'timeout' ? 'offline' : 'idle',
        pendingCount, rejectedCount, lastErrorKind: failure,
      });
    }
  }

  // Runs a cycle now, or once more after the current one. Never rejects.
  function requestSync(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          await runCycle();
        } while (rerun && !stopped);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // "Re-sync everything": the next cycle clears this user's pull cursors and re-pulls all docs.
  // Applied at the start of a cycle, so a cycle already running can't save an old cursor over it.
  function forceFullPull(): Promise<void> {
    if (stopped) return Promise.resolve();
    resetRequested = true;
    return requestSync();
  }

  // A user change was committed locally: push debounceMs after the LAST change
  function notifyLocalChange() {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void requestSync();
    }, debounceMs);
  }

  function start() {
    stopped = false;
    generation += 1;
    setStatus({...INITIAL_STATUS, state: 'idle'});
  }

  // Sign-out: ends any running cycle at its next check, cancels the debounce, forgets per-user state
  function stop() {
    stopped = true;
    generation += 1;
    rerun = false;
    resetRequested = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    rejected.clear();
    setStatus({...INITIAL_STATUS});
  }

  return {
    start,
    stop,
    requestSync,
    forceFullPull,
    notifyLocalChange,
    getStatus: (): SyncStatus => ({...status, pullCounts: {...status.pullCounts}}),
    subscribe(listener: (s: SyncStatus) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
