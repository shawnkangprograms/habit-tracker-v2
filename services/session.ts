import {useSyncExternalStore} from 'react';

// The uid whose local data the screens show: presumed from the sign-in marker or confirmed by Firebase (see
// utils/authSession.ts). Set only by the root layout, before it renders for that user. Screens read this, never
// getFirebaseAuth().currentUser, which is null until Firebase's network check at launch has finished.
// Network work (sync, admin and disabled checks, admin screens) still uses Firebase's confirmed user.

let uid: string | null = null;
const listeners = new Set<() => void>();

export function setSessionUid(next: string | null): void {
  if (next === uid) return;
  uid = next;
  for (const listener of [...listeners]) listener();
}

export function getSessionUid(): string | null {
  return uid;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionUid(): string | null {
  return useSyncExternalStore(subscribe, getSessionUid);
}
