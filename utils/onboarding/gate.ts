// When onboarding opens on its own, and what Skip writes (docs/ONBOARDING_SPEC.md, Addendum A in the plan). Pure.
//
// Auto-show needs all of: Home's first list has loaded, the user has zero active habits, the first restore from
// Firestore has finished (sync's initialPullDone, saved per uid), there is no local record for this uid, and
// this uid's sign-up pending flag is set (written by the sign-up success path, cleared when a record is
// written). So only a sign-up on this phone opens it; existing accounts and later sign-ins never do, and a
// sign-up killed before its first habit still reopens it on the next launch.
// The record and the flag are only read once the first three hold, so users with habits never pay for the read.
// The first-pull "wait over" fallback (15 s, or a sync cycle that ended offline) is deliberately not an input:
// a reinstall must never see onboarding before its habits have come back. An offline first sign-up therefore
// waits until a restore finishes (accepted known gap).

import {skippedRecord, type OnboardingRecord, type ParsedRecord} from '@/utils/onboarding/record';

export type GateInput = {
  loaded: boolean;// Home's first list load has finished
  activeCount: number | null;// active habits; null = unknown (a read failed)
  firstPullDone: boolean;// the first restore from Firestore has finished for this user
};

export function shouldCheckOnboarding(input: GateInput): boolean {
  return input.loaded && input.activeCount === 0 && input.firstPullDone;
}

// Only "nothing stored" after a sign-up on this phone opens it: a skip, a finished run, an unreadable record,
// or an account that never signed up here never does
export function shouldAutoShowOnboarding(record: ParsedRecord, pending: boolean): boolean {
  return record.kind === 'none' && pending;
}

export const pendingKey = (uid: string) => `onboarding:pending:v1:${uid}`;
export const PENDING_SET = '1';
export const PENDING_CLEARED = '0';// the storage has no remove, so clearing writes this

export function parsePending(raw: string | null): boolean {
  return raw === PENDING_SET;
}

// Onboarding closes itself when no one is signed in: a sign-up whose profile write failed is rolled back (the
// account deleted, signed out) after Home may already have opened it
export function shouldCloseForSession(uid: string | null | undefined): boolean {
  return !uid;
}

// How the flow was opened: by the gate on Home, or from the Settings row
export type OnboardingEntry = 'auto' | 'settings';

export function entryFromParam(param: unknown): OnboardingEntry {
  return param === 'settings' ? 'settings' : 'auto';
}

// "Skip setup", on any question or result screen: the first run writes a skip record so it never opens on its
// own again. From Settings, Skip writes nothing and leaves any earlier record as it was. Once this run has
// saved a finished record (a habit was created), Skip writes nothing, so that record and its habits stand.
export function recordOnSkip(entry: OnboardingEntry, savedThisRun = false): OnboardingRecord | null {
  return entry === 'auto' && !savedThisRun ? skippedRecord() : null;
}
