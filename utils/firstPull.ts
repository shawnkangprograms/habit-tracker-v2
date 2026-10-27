// The state behind hooks/use-first-pull.ts, as pure steps over the sync engine's status, so the order of
// events (sync now starts after Home is usable, so Home first sees it 'off') can be tested without React.

export type FirstPullStatus = {state: 'off' | 'idle' | 'syncing' | 'offline'; initialPullDone: boolean};
export type FirstPullState = {firstPullDone: boolean; waitOver: boolean; sawSyncing: boolean};

export function initialFirstPull(s: FirstPullStatus): FirstPullState {
  return {firstPullDone: s.initialPullDone, waitOver: s.state === 'offline', sawSyncing: s.state === 'syncing'};
}

// One status update. 'off' (not started yet) and the 'idle' that start() emits change nothing: only a cycle
// that was seen running and then ended without finishing the first pull ends the wait early.
export function nextFirstPull(prev: FirstPullState, s: FirstPullStatus): FirstPullState {
  const next = {...prev};
  if (s.initialPullDone) next.firstPullDone = true;
  if (s.state === 'syncing') {
    next.sawSyncing = true;
  } else if (s.state === 'offline' || (prev.sawSyncing && !s.initialPullDone)) {
    next.waitOver = true;// a cycle ended without finishing the first pull
  }
  return next;
}
