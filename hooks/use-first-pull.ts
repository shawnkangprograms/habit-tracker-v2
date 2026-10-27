import {useEffect, useState} from 'react';
import {getSyncStatus, subscribeSyncStatus} from '@/sync/syncEngine';
import {firstPullDeadline, initialFirstPull, nextFirstPull, type FirstPullStatus} from '@/utils/firstPull';

// For Home's empty state (utils/homeEmptyState.ts): has the first pull from Firestore finished for this user,
// and has waiting for it ended anyway (15 s after sync started, at most 30 s after Home mounted, or a sync
// cycle that ended without finishing it, e.g. offline)? Read-only use of the sync engine's existing status;
// changes nothing in sync. Re-renders only when one of the two flags flips, not on every status update.
// The steps and the deadline are in utils/firstPull.ts.
//
// Sync starts after Home is usable (app/_layout.tsx), so Home usually mounts with sync still 'off'. That
// changes nothing here: 'off' and start()'s 'idle' neither finish nor end the wait, so Home shows "checking",
// not "no habits", until the first cycle has pulled (or the wait ends). The 15 s count from sync's start, so
// the late start doesn't shorten the real wait.
//
// Account switches: Home lives in (tabs), which the root layout's Stack.Protected removes on sign-out and
// mounts fresh on the next sign-in, and sync's stop()/start() reset the status. So this state (and the
// timer) always starts over for a new user; nothing carries from one user to the next.
export function useFirstPull(): {firstPullDone: boolean; waitOver: boolean} {
  const [firstPullDone, setFirstPullDone] = useState(() => (getSyncStatus() as FirstPullStatus).initialPullDone);
  const [waitOver, setWaitOver] = useState(() => (getSyncStatus() as FirstPullStatus).state === 'offline');

  useEffect(() => {
    const mountedAt = Date.now();
    let state = initialFirstPull(getSyncStatus() as FirstPullStatus, mountedAt);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDeadline = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setWaitOver(true), Math.max(0, firstPullDeadline(state, mountedAt) - Date.now()));
    };
    scheduleDeadline();
    const unsubscribe = subscribeSyncStatus((s: FirstPullStatus) => {
      const startedBefore = state.syncStartedAt;
      state = nextFirstPull(state, s, Date.now());
      if (state.firstPullDone) setFirstPullDone(true);
      if (state.waitOver) setWaitOver(true);
      if (state.syncStartedAt !== startedBefore) scheduleDeadline();// sync just started: 15 s from now
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return {firstPullDone, waitOver};
}
