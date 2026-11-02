// The onboarding record's storage, per user: one JSON object under onboarding:v1:<uid> (utils/onboarding/record.ts).
// The only I/O in onboarding. Storage is injected (AsyncStorage in services/onboardingStore.ts, a Map in tests),
// so this runs under Node's test runner. Reads keep an in-memory copy per uid, so Home's gate reads storage at
// most once per user per app run. Like the other per-uid local data (insight:v1, celebrated:v1, sync:), the
// record is kept on sign-out: nothing in the app clears per-uid keys.
//
// Never throws. An unreadable storage reads as 'corrupt' (so onboarding never opens on a guess) and is not
// remembered, so the next read tries again. A failed save keeps the record in memory for this app run only.

import type {KeyValueStorage} from '@/services/celebratedStore';
import {parseRecord, recordKey, serialiseRecord, type OnboardingRecord, type ParsedRecord} from '@/utils/onboarding/record';

export function createOnboardingStore(storage: KeyValueStorage) {
  const memory = new Map<string, ParsedRecord>();
  let writes: Promise<void> = Promise.resolve();// one save at a time, in order

  async function read(uid: string): Promise<ParsedRecord> {
    const known = memory.get(uid);
    if (known) return known;
    let raw: string | null;
    try {
      raw = await storage.getItem(recordKey(uid));
    } catch {
      return {kind: 'corrupt'};
    }
    if (!memory.has(uid)) memory.set(uid, parseRecord(raw));// a write that finished meanwhile wins
    return memory.get(uid)!;
  }

  // Memory holds exactly what was saved (parsed back), so it can never hold more than storage does
  function write(uid: string, record: OnboardingRecord): Promise<void> {
    const json = serialiseRecord(record);
    memory.set(uid, parseRecord(json));
    const save = writes.then(() => storage.setItem(recordKey(uid), json));
    writes = save.catch(() => {});
    return writes;
  }

  return {read, write};
}
