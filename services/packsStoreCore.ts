// The pack record's storage, per user (utils/packs/record.ts): the canonical record under packs:v1:<uid>, and
// the mirror {uid, record} under one fixed key, read with the sign-in marker in services/authMarker.ts (the same
// native multiGet as the greeting's name), so Home can show packs on its first render with no extra startup
// read. The mirror counts only for its own uid; for any other uid the canonical record is read and the mirror is
// rebuilt from it. Every write saves both keys in one multiSet, so they can't drift apart. Storage is injected
// (AsyncStorage in services/packsStore.ts, a Map in tests). Like the onboarding record, kept on sign-out.
//
// Never throws. An unreadable storage reads as 'corrupt' (never written over) and is not remembered, so the next
// read tries again. A failed save keeps the value in memory for this app run only.

import {
  PACKS_MIRROR_KEY, packsKey, parseMirror, parsePacks, serialiseMirror, serialisePacks, type PacksRecord,
  type ParsedPacks,
} from '@/utils/packs/record';

export type PacksStorage = {
  getItem(key: string): Promise<string | null>;
  multiSet(pairs: [string, string][]): Promise<void>;
};

export function createPacksStore(storage: PacksStorage) {
  const memory = new Map<string, ParsedPacks>();
  let mirrorUid: string | null = null;// whose record the stored mirror holds, as far as this app run knows
  let writes: Promise<void> = Promise.resolve();// one save at a time, in order
  let updates: Promise<void> = Promise.resolve();// one read-change-write at a time

  function save(pairs: () => [string, string][]): Promise<void> {
    const next = writes.then(() => storage.multiSet(pairs()));
    writes = next.catch(() => {});
    return writes;
  }

  // The raw mirror value read with the marker at startup. Reads nothing.
  function loadMirror(raw: string | null): void {
    const mirror = parseMirror(raw);
    mirrorUid = mirror?.uid ?? null;
    if (mirror && !memory.has(mirror.uid)) memory.set(mirror.uid, mirror.parsed);
  }

  async function read(uid: string): Promise<ParsedPacks> {
    const known = memory.get(uid);
    if (known) return known;
    let raw: string | null;
    try {
      raw = await storage.getItem(packsKey(uid));
    } catch {
      return {kind: 'corrupt'};
    }
    if (!memory.has(uid)) memory.set(uid, parsePacks(raw));// a write that finished meanwhile wins
    if (mirrorUid !== uid) {
      mirrorUid = uid;
      save(() => [[PACKS_MIRROR_KEY, serialiseMirror(uid, memory.get(uid)!)]]);// the newest value when it runs
    }
    return memory.get(uid)!;
  }

  // Memory holds exactly what was saved (parsed back), so it never holds more than storage does
  function write(uid: string, record: PacksRecord): Promise<void> {
    const json = serialisePacks(record);
    const parsed = parsePacks(json);
    memory.set(uid, parsed);
    mirrorUid = uid;
    return save(() => [[packsKey(uid), json], [PACKS_MIRROR_KEY, serialiseMirror(uid, parsed)]]);
  }

  // Reads the current record, and writes what `change` returns (null: no write). Never throws.
  function update(uid: string, change: (parsed: ParsedPacks) => PacksRecord | null): Promise<void> {
    const run = updates.then(async () => {
      const next = change(await read(uid));
      if (next) await write(uid, next);
    });
    updates = run.catch(() => {});
    return updates;
  }

  return {loadMirror, read, write, update};
}
