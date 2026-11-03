// When onboarding opens on its own, and what Skip writes (docs/ONBOARDING_SPEC.md, Addendum A in the plan). Pure.
//
// Auto-show needs all of: Home's first list has loaded, the user has zero active habits, the first restore from
// Firestore has finished (sync's initialPullDone, saved per uid), and there is no local record for this uid.
// The record is only read once the first three hold, so users with habits never pay for the read.
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

// Only "nothing stored" opens it: a skip, a finished run, or an unreadable record never does
export function shouldAutoShowOnboarding(record: ParsedRecord): boolean {
  return record.kind === 'none';
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
