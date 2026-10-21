// What has already been celebrated, per user, on this device: keys like "level:4", "streak:7",
// "perfect:2026-10-21" and "early:2026-10-21" (see utils/celebrations.ts). The only stored state of the
// celebrations feature; XP, streaks and badges stay derived. Storage is injected (AsyncStorage in the app,
// a Map in tests). One JSON array per uid. level: and streak: keys are kept forever; perfect: and early:
// keys are pruned once they are more than 7 days old.

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const KEEP_DATED_KEYS_DAYS = 7;
const DATED_KEY = /^(perfect|early):(\d{4}-\d{2}-\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// The oldest date still kept: today minus KEEP_DATED_KEYS_DAYS (calendar arithmetic on YYYY-MM-DD only)
export function datedKeyCutoff(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) - KEEP_DATED_KEYS_DAYS * DAY_MS);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function createCelebratedStore(storage: KeyValueStorage) {
  const keyFor = (uid: string) => `celebrated:v1:${uid}`;
  const sets = new Map<string, Promise<Set<string>>>();// one shared Set per uid, read from storage once
  let writes: Promise<void> = Promise.resolve();// writes run one at a time, in order

  // Never throws: missing, unreadable or corrupt data counts as "nothing celebrated yet"
  async function read(uid: string): Promise<Set<string>> {
    try {
      const raw = await storage.getItem(keyFor(uid));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function setFor(uid: string): Promise<Set<string>> {
    let set = sets.get(uid);
    if (!set) {
      set = read(uid);
      sets.set(uid, set);
    }
    return set;
  }

  async function load(uid: string): Promise<ReadonlySet<string>> {
    return setFor(uid);
  }

  // Adds the keys in memory first (so the next load already sees them), prunes old dated keys, then saves.
  // Never throws; a failed save only means a possible repeat after a restart.
  async function mark(uid: string, keys: string[], today: string): Promise<void> {
    if (keys.length === 0) return;
    const set = await setFor(uid);
    for (const key of keys) set.add(key);
    const cutoff = datedKeyCutoff(today);
    for (const key of set) {
      const dated = DATED_KEY.exec(key);
      if (dated && dated[2] < cutoff) set.delete(key);
    }
    const save = writes.then(() => storage.setItem(keyFor(uid), JSON.stringify([...set])));
    writes = save.catch(() => {});
    return writes;
  }

  return {load, mark};
}
