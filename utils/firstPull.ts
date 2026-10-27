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

// When waiting ends anyway: FIRST_PULL_WAIT_MS after sync started, but never later than FIRST_PULL_CAP_MS
// after Home mounted (so a sync that never starts can't leave Home on "checking")
export function firstPullDeadline(state: FirstPullState, mountedAt: number): number {
  const cap = mountedAt + FIRST_PULL_CAP_MS;
  return state.syncStartedAt === null ? cap : Math.min(state.syncStartedAt + FIRST_PULL_WAIT_MS, cap);
}
