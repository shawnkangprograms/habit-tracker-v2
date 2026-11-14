// The users/{uid} profile that sign-up couldn't confirm yet, kept on this phone until it is on the server (the
// orphan-account fix, docs/HABITQUEST_DESIGN.md). Pure: the record, the error kinds and the recovery copy; storage
// and Firestore are in services/profileCompletionCore.ts and services/profileCompletion.ts.
//
// profile:pending:v1:<uid> = {version: 1, age, firstName, lastName}. Written once at sign-up, right after the Auth
// account exists and before anything else; removed once the profile is on the server. Never re-saved, so there is
// nothing for an older build to drop (P-8 doesn't apply). Never synced, never sent anywhere but the user's own
// profile document.

import {validateAge, validatePersonName} from '@/validation/validators';

export const PROFILE_WRITE_TIMEOUT_MS = 10_000;// sign-up and the recovery screen; decided 2026-11-14

export type PendingProfile = {age: number; firstName: string; lastName: string};

export const pendingProfileKey = (uid: string) => `profile:pending:v1:${uid}`;

// Missing, corrupt or no longer valid (the same rules as sign-up): null
export function parsePendingProfile(raw: string | null): PendingProfile | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  const age = validateAge(o.age);
  const first = validatePersonName(o.firstName, 'first');
  const last = validatePersonName(o.lastName, 'last');
  if (!age.valid || !first.valid || !last.valid) return null;
  return {age: age.value, firstName: first.value, lastName: last.value};
}

export function serialisePendingProfile(p: PendingProfile): string {
  return JSON.stringify({version: 1, age: p.age, firstName: p.firstName, lastName: p.lastName});
}

// A refusal that retrying won't change (the rules, or a doc that now exists and can only be updated): the completer
// reads again, then hands over to the recovery screen. Anything else (offline, a timeout) is retried later.
const PERMANENT = ['permission-denied', 'invalid-argument', 'failed-precondition', 'already-exists'];

export function isPermanentWriteError(err: unknown): boolean {
  const code = (err as {code?: unknown} | null)?.code;
  return typeof code === 'string' && PERMANENT.includes(code);
}

// What the account check does about the profile. admin: from admins/{uid} on the server, read only when the profile
// is missing (null: not read, or the read failed). An admin account made in the console has no profile by design:
// never completed, never sent to the recovery screen, and its pending record (if any) is left alone. An unknown
// profile, or an unknown admin answer, does nothing at all.
export function profileAction(profile: 'exists' | 'missing' | 'unknown', admin: boolean | null): 'complete' | 'skip' {
  if (profile === 'exists') return 'complete';// clears a pending record left from sign-up
  return profile === 'missing' && admin === false ? 'complete' : 'skip';
}

// The recovery screen opens only when the server has just said there is no profile, the account is not an admin
// (read from the server: false, not unknown), AND nothing on this phone could complete it ('none': nothing pending;
// 'refused': the server refused it for good). Offline, an error or a pending write still being retried never opens
// it. Phase F (guest mode, not built): a guest has no profile by design and must be exempt from this check.
export function needsProfileSetup(
  profile: 'exists' | 'missing' | 'unknown',
  admin: boolean | null,
  completion: 'done' | 'none' | 'waiting' | 'refused',
): boolean {
  return profile === 'missing' && admin === false && (completion === 'none' || completion === 'refused');
}

// ---------- The recovery screen (approved 2026-11-14) ----------

export const SETUP_TITLE = 'Finish setting up your account';
export const SETUP_BODY = "We couldn't save your details when you signed up. Add them to keep using HabitQuest.";
export const SETUP_SAVE = 'Save and continue';
export const SETUP_FAILED = "Couldn't save your details. Check your internet connection and try again.";
export const SETUP_AGE_LABEL = 'Age';

// What Save does with the age as typed: 'underAge' (the existing sign-up message; nothing is written and the user is
// signed out), 'invalid' (the field shows its error), or the valid age
export function setupAgeOutcome(input: string): {kind: 'underAge'; message: string} | {kind: 'invalid'} | {kind: 'ok'; age: number} {
  const result = validateAge(input);
  if (result.valid) return {kind: 'ok', age: result.value};
  const n = /^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN;
  return Number.isInteger(n) && n < 18 ? {kind: 'underAge', message: result.error} : {kind: 'invalid'};
}
