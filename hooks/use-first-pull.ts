import {useEffect, useState} from 'react';
import {getSyncStatus, subscribeSyncStatus} from '@/sync/syncEngine';

export const FIRST_PULL_WAIT_MS = 15 * 1000;

type Status = {state: 'off' | 'idle' | 'syncing' | 'offline'; initialPullDone: boolean};

// For Home's empty state (utils/homeEmptyState.ts): has the first pull from Firestore finished for this user,
// and has waiting for it ended anyway (15 s, or a sync cycle that ended without finishing it, e.g. offline)?
// Read-only use of the sync engine's existing status; changes nothing in sync. Re-renders only when one of
// the two flags flips, not on every status update.
//
// Account switches: Home lives in (tabs), which the root layout's Stack.Protected removes on sign-out and
// mounts fresh on the next sign-in, and sync's stop()/start() reset the status. So this state (and the
// timer) always starts over for a new user; nothing carries from one user to the next.
export function useFirstPull(): {firstPullDone: boolean; waitOver: boolean} {
  const [firstPullDone, setFirstPullDone] = useState(() => (getSyncStatus() as Status).initialPullDone);
  const [waitOver, setWaitOver] = useState(() => (getSyncStatus() as Status).state === 'offline');

  useEffect(() => {
    let sawSyncing = (getSyncStatus() as Status).state === 'syncing';
    const unsubscribe = subscribeSyncStatus((s: Status) => {
      if (s.initialPullDone) setFirstPullDone(true);
      if (s.state === 'syncing') {
        sawSyncing = true;
      } else if (s.state === 'offline' || (sawSyncing && !s.initialPullDone)) {
        setWaitOver(true);// a cycle ended without finishing the first pull
      }
    });
    const timer = setTimeout(() => setWaitOver(true), FIRST_PULL_WAIT_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return {firstPullDone, waitOver};
}
