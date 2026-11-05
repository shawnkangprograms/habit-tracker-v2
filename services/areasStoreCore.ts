// The radar area of each habit in no pack (or in a custom pack with no area), per user, under areas:v1:<uid> on
// this phone: {habitId: area | 'none'} (docs/PACKS_REPORTS_SPEC.md, section 11). Storage is injected (AsyncStorage in
// services/areasStore.ts, a Map in tests). Read once per uid per app run, then served from memory; saves run one at a
// time. Kept on sign-out like the packs and reflections records. Never synced, never sent anywhere: a habit pulled
// onto a new phone has no entry and uses its icon's area. Entries of deleted habits are left in place.
//
// Never throws. A missing, unreadable or corrupt record reads as an empty map (every habit uses its icon's area);
// an unreadable one is not remembered, so the next read tries again.

import {isAreaValue, type AreasMap, type AreaValue} from '@/utils/radar/areas';

export type AreasStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const areasKey = (uid: string) => `areas:v1:${uid}`;

// Only valid entries survive; anything that isn't an object of them reads as empty
export function parseAreas(raw: string | null): AreasMap {
  if (raw === null) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: AreasMap = {};
    for (const [habitId, value] of Object.entries(data as Record<string, unknown>)) {
      if (isAreaValue(value)) out[habitId] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function createAreasStore(storage: AreasStorage) {
  const memory = new Map<string, AreasMap>();
  let updates: Promise<unknown> = Promise.resolve();// one read-change-write at a time

  async function read(uid: string): Promise<AreasMap> {
    const known = memory.get(uid);
    if (known) return known;
    try {
      const parsed = parseAreas(await storage.getItem(areasKey(uid)));
      if (!memory.has(uid)) memory.set(uid, parsed);// a save that finished meanwhile wins
      return memory.get(uid)!;
    } catch {
      return {};
    }
  }

  // Saves one habit's area. Resolves false if it couldn't be saved (the habit then keeps its icon's area).
  function write(uid: string, habitId: string, value: AreaValue): Promise<boolean> {
    const run = updates.then(async () => {
      const current = await read(uid);
      if (current[habitId] === value) return true;
      const next = {...current, [habitId]: value};
      try {
        await storage.setItem(areasKey(uid), JSON.stringify(next));
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
