// The state behind hooks/use-first-pull.ts, as pure steps over the sync engine's status, so the order of
// events (sync now starts after Home is usable, so Home first sees it 'off') can be tested without React.

export const FIRST_PULL_WAIT_MS = 15 * 1000;// real waiting: counted from when sync starts
export const FIRST_PULL_CAP_MS = 30 * 1000;// from Home's mount, in case sync never starts

export type FirstPullStatus = {state: 'off' | 'idle' | 'syncing' | 'offline'; initialPullDone: boolean};
export type FirstPullState = {
  firstPullDone: boolean;
  waitOver: boolean;
  sawSyncing: boolean;
  syncStartedAt: number | null;// when the status first left 'off' (ms, same clock as `now`)
};

export function initialFirstPull(s: FirstPullStatus, now: number): FirstPullState {
  return {
    firstPullDone: s.initialPullDone,
    waitOver: s.state === 'offline',
    sawSyncing: s.state === 'syncing',
    syncStartedAt: s.state === 'off' ? null : now,
  };
}

// One status update. 'off' (not started yet) and the 'idle' that start() emits change nothing: only a cycle
// that was seen running and then ended without finishing the first pull ends the wait early.
export function nextFirstPull(prev: FirstPullState, s: FirstPullStatus, now: number): FirstPullState {
  const next = {...prev};
  if (s.initialPullDone) next.firstPullDone = true;
  if (next.syncStartedAt === null && s.state !== 'off') next.syncStartedAt = now;
  if (s.state === 'syncing') {
    next.sawSyncing = true;
  } else if (s.state === 'offline' || (prev.sawSyncing && !s.initialPullDone)) {
    next.waitOver = true;// a cycle ended without finishing the first pull
  }
  return next;
}

// ---------- S-4: template-creating actions wait for this uid's first pull (docs/PACKS_REPORTS_SPEC.md, section 17) ----------
// "Add the rest" and a Settings retake create nothing until this uid's first pull from Firestore has finished on this
// phone, so templates whose habits are still on the server aren't created twice. 'done': the engine says so for
// this uid, or the stored sync state does (offline after an earlier pull, or sync not started yet); 'waiting': the
// stored state says not yet; 'unknown': the stored state couldn't be read (R-1). Only 'done' lets them run.

export type FirstPullResult = 'done' | 'waiting' | 'unknown';

// One line for both paths and for 'unknown' (approved 2026-11-13)
export const RESTORING_LINE = 'Your habits are still being restored. Stay online and try again in a moment.';

export async function firstPullResult(input: {
  statusDone: boolean;// the running engine is for this uid and its status says the first pull is done
  loadStored: () => Promise<{initialPullDone: boolean}>;// this uid's stored sync state; rejects if unreadable
}): Promise<FirstPullResult> {
  if (input.statusDone) return 'done';
  try {
    return (await input.loadStored()).initialPullDone ? 'done' : 'waiting';
  } catch {
    return 'unknown';
  }
}

// Runs a template-creating action only once the first pull is done; otherwise nothing runs and the caller shows
// RESTORING_LINE
export async function whenRestored<T>(
  check: () => Promise<FirstPullResult>,
  run: () => Promise<T>,
): Promise<{restored: true; value: T} | {restored: false; result: FirstPullResult}> {
  const result = await check();
  return result === 'done' ? {restored: true, value: await run()} : {restored: false, result};
}

// When waiting ends anyway: FIRST_PULL_WAIT_MS after sync started, but never later than FIRST_PULL_CAP_MS
// after Home mounted (so a sync that never starts can't leave Home on "checking")
export function firstPullDeadline(state: FirstPullState, mountedAt: number): number {
  const cap = mountedAt + FIRST_PULL_CAP_MS;
  return state.syncStartedAt === null ? cap : Math.min(state.syncStartedAt + FIRST_PULL_WAIT_MS, cap);
}
