import {useEffect, useState} from 'react';
import {getSyncStatus, subscribeSyncStatus} from '@/sync/syncEngine';
import {initialFirstPull, nextFirstPull, type FirstPullStatus} from '@/utils/firstPull';

export const FIRST_PULL_WAIT_MS = 15 * 1000;

// For Home's empty state (utils/homeEmptyState.ts): has the first pull from Firestore finished for this user,
// and has waiting for it ended anyway (15 s, or a sync cycle that ended without finishing it, e.g. offline)?
// Read-only use of the sync engine's existing status; changes nothing in sync. Re-renders only when one of
// the two flags flips, not on every status update. The steps are in utils/firstPull.ts.
//
// Sync starts after Home is usable (app/_layout.tsx), so Home usually mounts with sync still 'off'. That
// changes nothing here: 'off' and start()'s 'idle' neither finish nor end the wait, so Home shows "checking",
// not "no habits", until the first cycle has pulled (or the wait ends).
//
// Account switches: Home lives in (tabs), which the root layout's Stack.Protected removes on sign-out and
// mounts fresh on the next sign-in, and sync's stop()/start() reset the status. So this state (and the
// timer) always starts over for a new user; nothing carries from one user to the next.
export function useFirstPull(): {firstPullDone: boolean; waitOver: boolean} {
  const [firstPullDone, setFirstPullDone] = useState(() => (getSyncStatus() as FirstPullStatus).initialPullDone);
  const [waitOver, setWaitOver] = useState(() => (getSyncStatus() as FirstPullStatus).state === 'offline');

  useEffect(() => {
    let state = initialFirstPull(getSyncStatus() as FirstPullStatus);
    const unsubscribe = subscribeSyncStatus((s: FirstPullStatus) => {
      state = nextFirstPull(state, s);
      if (state.firstPullDone) setFirstPullDone(true);
      if (state.waitOver) setWaitOver(true);
    });
    const timer = setTimeout(() => setWaitOver(true), FIRST_PULL_WAIT_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return {firstPullDone, waitOver};
}
