import type {PermissionState} from '@/services/notificationsCore';

// Pure decisions for the notification scheduler (services/notificationScheduler.ts), kept here so they can be
// tested without React Native. The scheduler tracks auth itself from onAuthStateChanged, and never reads
// auth.currentUser: that is null before Firebase has restored the session, which must not look like a sign-out.

export type SchedulerAuth =
  | {kind: 'unknown'}// no auth callback yet
  | {kind: 'signedOut'}
  | {kind: 'signedIn'; uid: string};

export type RebuildDecision = 'skip' | 'cancelAll' | 'build';

// prefs is null when it was not loaded (not signed in); permission is null when it was not asked (both switches off)
export function decideRebuild({auth, prefs, permission}: {
  auth: SchedulerAuth;
  prefs: {remindersOn: boolean; nudgeOn: boolean} | null;
  permission: PermissionState | null;
}): RebuildDecision {
  if (auth.kind === 'unknown') return 'skip';// never cancel everything on a guess
  if (auth.kind === 'signedOut') return 'cancelAll';
  if (!prefs) return 'skip';
  if (!prefs.remindersOn && !prefs.nudgeOn) return 'cancelAll';
  if (permission !== 'granted') return 'skip';// Settings explains and links to the phone settings
  return 'build';
}

// Checked again just before applying: a rebuild started for one user must not apply after that user signed out
// or another user signed in while it was reading
export function stillCurrent(startedFor: string, auth: SchedulerAuth): boolean {
  return auth.kind === 'signedIn' && auth.uid === startedFor;
}
