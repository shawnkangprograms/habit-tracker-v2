// The onboarding record's storage, per user: one JSON object under onboarding:v1:<uid> (utils/onboarding/record.ts),
// plus the sign-up pending flag under onboarding:pending:v1:<uid> (utils/onboarding/gate.ts). The only I/O in
// onboarding. Storage is injected (AsyncStorage in services/onboardingStore.ts, a Map in tests), so this runs
// under Node's test runner. Reads keep an in-memory copy per uid, so Home's gate reads storage at most once per
// user per app run. Like the other per-uid local data (insight:v1, celebrated:v1, sync:), the record is kept on
// sign-out: nothing in the app clears per-uid keys.
//
// Never throws. An unreadable storage reads as 'corrupt' and as "not pending" (so onboarding never opens on a
// guess) and is not remembered, so the next read tries again. A failed save keeps the value in memory for this
// app run only. A record that couldn't be read is never written over (R-1): until a read of it succeeds, write()
// skips silently (a Settings retake still creates its habits; name dedupe still applies on the next retake).

import type {KeyValueStorage} from '@/services/celebratedStore';
import {PENDING_CLEARED, PENDING_SET, parsePending, pendingKey} from '@/utils/onboarding/gate';
import {parseRecord, recordKey, serialiseRecord, type OnboardingRecord, type ParsedRecord} from '@/utils/onboarding/record';

export function createOnboardingStore(storage: KeyValueStorage) {
  const memory = new Map<string, ParsedRecord>();
  const pendingMemory = new Map<string, boolean>();
  const unreadable = new Set<string>();// uids whose record read failed, until one succeeds
  let writes: Promise<void> = Promise.resolve();// one save at a time, in order

  function save(key: string, value: string): Promise<void> {
    const next = writes.then(() => storage.setItem(key, value));
    writes = next.catch(() => {});
    return writes;
  }

  async function read(uid: string): Promise<ParsedRecord> {
    const known = memory.get(uid);
    if (known) return known;
    let raw: string | null;
    try {
      raw = await storage.getItem(recordKey(uid));
    } catch {
      unreadable.add(uid);
      return {kind: 'corrupt'};
    }
    unreadable.delete(uid);
    if (!memory.has(uid)) memory.set(uid, parseRecord(raw));// a write that finished meanwhile wins
    return memory.get(uid)!;
  }

  // Memory holds exactly what was saved (parsed back), so it can never hold more than storage does. Writing a
  // record (finish or skip) also clears the pending flag, unless it is already known to be clear. Skipped while
  // the record couldn't be read (see above).
  function write(uid: string, record: OnboardingRecord): Promise<void> {
    if (unreadable.has(uid)) return Promise.resolve();
    const json = serialiseRecord(record);
    memory.set(uid, parseRecord(json));
    const saved = save(recordKey(uid), json);
    return pendingMemory.get(uid) === false ? saved : clearPending(uid);
  }

  async function isPending(uid: string): Promise<boolean> {
    const known = pendingMemory.get(uid);
    if (known !== undefined) return known;
    let raw: string | null;
    try {
      raw = await storage.getItem(pendingKey(uid));
    } catch {
      return false;
    }
    if (!pendingMemory.has(uid)) pendingMemory.set(uid, parsePending(raw));// a mark or clear meanwhile wins
    return pendingMemory.get(uid)!;
  }

  // Called by the sign-up success path only (services/authActions.js)
  function markPending(uid: string): Promise<void> {
    pendingMemory.set(uid, true);
    return save(pendingKey(uid), PENDING_SET);
  }

  function clearPending(uid: string): Promise<void> {
    pendingMemory.set(uid, false);
    return save(pendingKey(uid), PENDING_CLEARED);
  }

  return {read, write, isPending, markPending, clearPending};
}
