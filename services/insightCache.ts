// The Home insight card's local cache, per user: the latest insight (shown offline, with its day) and the day's
// attempt record. One JSON object per uid under insight:v1:<uid>; never synced. Storage is injected
// (AsyncStorage in the app through services/insights.ts, a Map in tests), so this runs under Node's test runner.
// Reads keep an in-memory copy per uid, so returning to Home never reads storage again.
// Never throws: missing, corrupt or wrongly shaped data reads as empty; a failed save only loses the cache.

import type {KeyValueStorage} from '@/services/celebratedStore';
import {EMPTY_ENTRY, isInsight, type CacheEntry} from '@/utils/insightSchedule';
import {isDateString} from '@/utils/gamification';

export const cacheKey = (uid: string) => `insight:v1:${uid}`;

// The stored JSON as a CacheEntry, or EMPTY_ENTRY if anything about it is off
export function parseEntry(raw: string | null): CacheEntry {
  if (!raw) return EMPTY_ENTRY;
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object') return EMPTY_ENTRY;
    const o = v as Record<string, unknown>;
    if (o.v !== 1) return EMPTY_ENTRY;
    const insight = isInsight(o.insight) ? {day: o.insight.day, teaser: o.insight.teaser, detail: o.insight.detail} : null;
    // An attempt recorded as 'unavailable' (older builds ended the day on a server failure) is dropped, so
    // that user is retried; the server's attempt cap still bounds it. 'limit' and 'refused' still end the day.
    if (o.attemptStatus === 'unavailable') return {v: 1, insight, attemptedDay: null, attemptStatus: null};
    const attemptedDay = isDateString(o.attemptedDay) ? o.attemptedDay : null;
    const attemptStatus = attemptedDay && (o.attemptStatus === 'limit' || o.attemptStatus === 'refused') ? o.attemptStatus : null;
    return {v: 1, insight, attemptedDay, attemptStatus};
  } catch {
    return EMPTY_ENTRY;
  }
}

export function createInsightCache(storage: KeyValueStorage) {
  const memory = new Map<string, CacheEntry>();
  let writes: Promise<void> = Promise.resolve();// one save at a time, in order

  async function read(uid: string): Promise<CacheEntry> {
    const known = memory.get(uid);
    if (known) return known;
    let entry = EMPTY_ENTRY;
    try {
      entry = parseEntry(await storage.getItem(cacheKey(uid)));
    } catch {
      // unreadable storage: nothing cached
    }
    if (!memory.has(uid)) memory.set(uid, entry);// a write that finished meanwhile wins
    return memory.get(uid)!;
  }

  function write(uid: string, entry: CacheEntry): Promise<void> {
    memory.set(uid, entry);
    const save = writes.then(() => storage.setItem(cacheKey(uid), JSON.stringify(entry)));
    writes = save.catch(() => {});
    return writes;
  }

  return {read, write};
}
