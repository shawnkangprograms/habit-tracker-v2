// Completing the users/{uid} profile after sign-up, instead of deleting the account when its write fails (the
// orphan-account fix, docs/HABITQUEST_DESIGN.md). Storage and the server are injected (AsyncStorage and Firestore in
// services/profileCompletion.ts, fakes in tests). Never throws.
//
// Sign-up saves the details on this phone first (savePending), then writes the profile with a 10 s timeout
// (writeNow). If that doesn't land, the account stays signed in and complete() finishes it later: on sign-in, launch,
// foreground and after a sync cycle, never on the startup path. complete() reads the server first, so a write that
// landed late is never written twice. Results:
// - 'done': the profile is on the server (now or already); the pending record is gone
// - 'none': nothing pending on this phone
// - 'waiting': offline, a timeout, or the pending record couldn't be read (R-1: nothing acted on); tried again later
// - 'refused': the server refused the write for good; the pending record is dropped and the recovery screen asks
// One run per uid at a time; a second caller joins it.

import {
  isPermanentWriteError, needsProfileSetup, parsePendingProfile, pendingProfileKey, profileAction, serialisePendingProfile,
  type PendingProfile,
} from '@/utils/profilePending';

export type ProfileStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type ProfileServer = {
  exists(uid: string): Promise<boolean>;// from the server only; rejects offline or on any error
  create(uid: string, profile: PendingProfile): Promise<void>;// rejects with a Firestore-style code (timeout included)
};

export type CompletionResult = 'done' | 'none' | 'waiting' | 'refused';

export function createProfileCompletion(deps: {storage: ProfileStorage; server: ProfileServer}) {
  const {storage, server} = deps;
  const running = new Map<string, Promise<CompletionResult>>();

  const clear = (uid: string) => storage.removeItem(pendingProfileKey(uid)).catch(() => {});

  // Sign-up, right after the Auth account exists. Never throws: if it can't be saved, a profile that doesn't land
  // is caught by the recovery screen instead.
  async function savePending(uid: string, profile: PendingProfile): Promise<void> {
    await storage.setItem(pendingProfileKey(uid), serialisePendingProfile(profile)).catch(() => {});
  }

  // Sign-up's own attempt: true if the profile is on the server (and nothing is pending any more)
  async function writeNow(uid: string, profile: PendingProfile): Promise<boolean> {
    try {
      await server.create(uid, profile);
    } catch {
      return false;// kept pending: complete() finishes it
    }
    await clear(uid);
    return true;
  }

  async function run(uid: string, serverMissing: boolean): Promise<CompletionResult> {
    let raw: string | null;
    try {
      raw = await storage.getItem(pendingProfileKey(uid));
    } catch {
      return 'waiting';
    }
    const pending = parsePendingProfile(raw);
    if (raw !== null && !pending) await clear(uid);// corrupt: of no use to anyone
    if (!pending) return 'none';
    try {
      if (!serverMissing && await server.exists(uid)) {
        await clear(uid);
        return 'done';
      }
    } catch {
      return 'waiting';
    }
    try {
      await server.create(uid, pending);
    } catch (err) {
      if (!isPermanentWriteError(err)) return 'waiting';
      // another phone, or a late write, may have created it meanwhile: then the create is refused as an update
      try {
        if (await server.exists(uid)) {
          await clear(uid);
          return 'done';
        }
      } catch {
        return 'waiting';
      }
      await clear(uid);
      return 'refused';
    }
    await clear(uid);
    return 'done';
  }

  // serverMissing: the caller has just read the server and found no profile (skips one read)
  function complete(uid: string, options: {serverMissing?: boolean} = {}): Promise<CompletionResult> {
    let job = running.get(uid);
    if (!job) {
      job = run(uid, options.serverMissing ?? false).catch((): CompletionResult => 'waiting')
        .finally(() => running.delete(uid));
      running.set(uid, job);
    }
    return job;
  }

  // Is something pending for this uid? (false if it can't be read)
  async function hasPending(uid: string): Promise<boolean> {
    try {
      return (await storage.getItem(pendingProfileKey(uid))) !== null;
    } catch {
      return false;
    }
  }

  return {savePending, writeNow, complete, hasPending};
}

export type ProfileCompletion = ReturnType<typeof createProfileCompletion>;

// After the account check (services/useDisabledCheck.ts): true if "Finish setting up your account" should open.
// An unknown profile, an admin with no profile, or an admin read that failed does nothing at all (no completion, so a
// pending record is left alone); otherwise the completer runs and recovery opens only for a confirmed missing profile
// of a non-admin that nothing on this phone could complete.
export async function settleProfile(
  completion: Pick<ProfileCompletion, 'complete'>,
  uid: string,
  check: {profile: 'exists' | 'missing' | 'unknown'; admin: boolean | null},
): Promise<boolean> {
  if (profileAction(check.profile, check.admin) === 'skip') return false;
  const result = await completion.complete(uid, {serverMissing: check.profile === 'missing'});
  return needsProfileSetup(check.profile, check.admin, result);
}
