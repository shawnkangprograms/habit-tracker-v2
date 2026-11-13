// The radar area of each habit in no pack (or in a custom pack with no area), per user, under areas:v1:<uid> on
// this phone: {habitId: area | 'none'} (docs/PACKS_REPORTS_SPEC.md, section 11). Storage is injected (AsyncStorage in
// services/areasStore.ts, a Map in tests). Read once per uid per app run, then served from memory; saves run one at a
// time. Kept on sign-out like the packs and reflections records. Never synced, never sent anywhere: a habit pulled
// onto a new phone has no entry and uses its icon's area. Entries of deleted habits are left in place.
//
// Never throws. A missing, unreadable or corrupt record reads as an empty map (every habit uses its icon's area);
// an unreadable one is not remembered, so the next read tries again.
//
// P-8 (docs/PACKS_REPORTS_SPEC.md, section 17): an entry whose value this build can't read (written by a newer
// build) is not used, but is kept and written back unchanged; setting that habit's area replaces it.
//
// R-1 (section 17): a write also removes the entries, readable or not, of habits known to be deleted (ids from
// SQLite with deleted = 1). A habit missing from this phone is never "deleted", and a failed read of the deleted
// ids prunes nothing. Storage that couldn't be read is never written over: the write then resolves false.

import {isAreaValue, type AreasMap, type AreaValue} from '@/utils/radar/areas';
import {isPlainObject, withUnknown, type UnknownFields} from '@/utils/unknownFields';

export type AreasStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const areasKey = (uid: string) => `areas:v1:${uid}`;

// The readable entries, and the ones this build can't read (absent if none)
export type AreasRecord = {areas: AreasMap; unknownFields?: UnknownFields};

// Anything that isn't an object reads as empty (and is replaced by the next write, as before)
export function parseAreasRecord(raw: string | null): AreasRecord {
  if (raw === null) return {areas: {}};
  try {
    const data: unknown = JSON.parse(raw);
    if (!isPlainObject(data)) return {areas: {}};
    const areas: AreasMap = {};
    const unread: [string, unknown][] = [];
    for (const [habitId, value] of Object.entries(data)) {
      if (isAreaValue(value)) areas[habitId] = value;
      else unread.push([habitId, value]);
    }
    return unread.length > 0 ? {areas, unknownFields: Object.freeze(Object.fromEntries(unread))} : {areas};
  } catch {
    return {areas: {}};
  }
}

// Only valid entries are used; anything that isn't an object of them reads as empty
export function parseAreas(raw: string | null): AreasMap {
  return parseAreasRecord(raw).areas;
}

// R-1: the record without the entries of these deleted habits, readable or kept unreadable (P-8). The same object
// when nothing is removed.
export function pruneAreas(record: AreasRecord, deleted: ReadonlySet<string>): AreasRecord {
  const areas = Object.entries(record.areas).filter(([habitId]) => !deleted.has(habitId));
  const kept = Object.entries(record.unknownFields ?? {}).filter(([habitId]) => !deleted.has(habitId));
  const removed = Object.keys(record.areas).length - areas.length + Object.keys(record.unknownFields ?? {}).length - kept.length;
  if (removed === 0) return record;
  const pruned: AreasRecord = {areas: Object.fromEntries(areas)};
  return kept.length > 0 ? {...pruned, unknownFields: Object.freeze(Object.fromEntries(kept))} : pruned;
}

// The stored value: the kept entries first, then the readable ones (which win for the same habit)
export function serialiseAreas(record: AreasRecord): string {
  return JSON.stringify(withUnknown(record.unknownFields, {...record.areas}));
}

export function createAreasStore(storage: AreasStorage) {
  const memory = new Map<string, AreasRecord>();
  let updates: Promise<unknown> = Promise.resolve();// one read-change-write at a time

  // null: storage couldn't be read (nothing remembered)
  async function load(uid: string): Promise<AreasRecord | null> {
    const known = memory.get(uid);
    if (known) return known;
    try {
      const parsed = parseAreasRecord(await storage.getItem(areasKey(uid)));
      if (!memory.has(uid)) memory.set(uid, parsed);// a save that finished meanwhile wins
      return memory.get(uid)!;
    } catch {
      return null;
    }
  }

  async function read(uid: string): Promise<AreasMap> {
    return (await load(uid))?.areas ?? {};
  }

  // Saves one habit's area, removing the entries of `deletedIds` (R-1; null or absent: nothing is pruned). Resolves
  // false if it couldn't be saved, or if storage couldn't be read (never written over); the habit then keeps its
  // icon's area.
  function write(uid: string, habitId: string, value: AreaValue, deletedIds?: readonly string[] | null): Promise<boolean> {
    const run = updates.then(async () => {
      const loaded = await load(uid);
      if (!loaded) return false;
      const current = deletedIds ? pruneAreas(loaded, new Set(deletedIds)) : loaded;
      if (current === loaded && current.areas[habitId] === value) return true;
      const next: AreasRecord = {...current, areas: {...current.areas, [habitId]: value}};
      try {
        await storage.setItem(areasKey(uid), serialiseAreas(next));
      } catch {
        return false;
      }
      memory.set(uid, next);
      return true;
    });
    updates = run.catch(() => {});
    return run.catch(() => false);
  }

  return {read, write};
}
