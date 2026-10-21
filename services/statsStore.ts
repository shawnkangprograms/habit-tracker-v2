// Shared gamification stats for screens that show them outside Home (the Profile tab and its streak icon).
// Home keeps loading stats exactly as before and publishes each result here; Profile reuses it, joins a load
// that is still running, or loads on its own only when the store is empty or out of date. The tab icon only reads.
// No React and no database here, so it runs under Node's test runner; screens read it through hooks/use-stats.ts.
//
// Freshness: `gen` counts local and remote data changes. A load records `gen` when it starts; its result is
// fresh only if no change arrived meanwhile. This module subscribes to both change signals when it is first
// imported, and it never unsubscribes. Every caller of beginLoad imports this module, so that subscription is
// registered before any screen's listener, and the change emitters call listeners in subscription order:
// markStale always runs before a screen's handler for the same change can call beginLoad.

import type {GamificationStats} from '@/utils/gamification';
import {isDeepEqual} from '@/utils/equality';
import {onLocalChange} from '@/db/localChanges';
import {onRemoteChange} from '@/db/remoteChanges';

export type StatsEntry = {userId: string; date: string; stats: GamificationStats};// date: the local day it was computed for
export type SharedLoadResult = {entry: StatsEntry | null; source: 'reused' | 'joined' | 'loaded'};
export type LoadTicket = {gen: number; remoteGen: number};// counters captured when a load STARTS

// What a publish replaced. `comparable` says the difference between `previous` and the new entry can only
// come from local changes (the user's own actions): same user, same day, and no remote change from the
// start of the previous entry's load until this publish. Celebrations use it to never react to sync.
export type PublishResult = {accepted: boolean; previous: StatsEntry | null; comparable: boolean};

let currentUser: string | null = null;
let entry: StatsEntry | null = null;
let gen = 0;// bumped by every local or remote change
let remoteGen = 0;// bumped by remote changes only
let publishedGen = -1;// gen at which the shown entry's load started; the entry is fresh while this equals gen
let publishedRemoteGen = -1;// remoteGen at which the shown entry's load started
let inFlight: (LoadTicket & {userId: string; promise: Promise<StatsEntry | null>}) | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

export function markStale(): void {
  gen += 1;
}

function markRemoteChange(): void {
  remoteGen += 1;
  markStale();
}

onLocalChange(markStale);
onRemoteChange(markRemoteChange);

// Same object until publish actually changes something (useSyncExternalStore needs a stable snapshot)
export function getEntry(): StatsEntry | null {
  return entry;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Called on every auth change, before any screen renders for the new user. A different user (or sign-out)
// clears everything, so one account never sees another's streak. The same user keeps what is there.
export function reset(userId: string | null): void {
  if (userId === currentUser) return;
  currentUser = userId;
  if (inFlight && inFlight.userId !== userId) inFlight = null;
  publishedGen = -1;
  publishedRemoteGen = -1;
  if (entry !== null) {
    entry = null;
    notify();
  }
}

// True if the store has nothing current for this user and day: empty, another user, another day,
// or a change arrived after the shown entry's load started
export function needsLoad(userId: string, today: string): boolean {
  return entry === null || entry.userId !== userId || entry.date !== today || publishedGen !== gen;
}

// Starts a load: records the counters BEFORE reading, so a change during the read leaves the result stale.
// Never rejects: resolves to null if the loader failed.
export function beginLoad(
  userId: string,
  date: string,
  loader: () => Promise<GamificationStats>,
): LoadTicket & {promise: Promise<StatsEntry | null>} {
  const startedGen = gen;
  const startedRemoteGen = remoteGen;
  const promise = loader().then(
    (stats): StatsEntry => ({userId, date, stats}),
    (err: unknown) => {
      console.log('Stats load failed', err);
      return null;
    },
  );
  const record = {userId, gen: startedGen, remoteGen: startedRemoteGen, promise};
  inFlight = record;
  promise.finally(() => {
    if (inFlight === record) inFlight = null;
  });
  return {gen: startedGen, remoteGen: startedRemoteGen, promise};
}

const REJECTED: PublishResult = {accepted: false, previous: null, comparable: false};

// Ignored for another user, or if a load that started later has already published.
// Notifies only if the stats really changed.
export function publish(next: StatsEntry | null, load: LoadTicket): PublishResult {
  if (!next || next.userId !== currentUser || load.gen < publishedGen) return REJECTED;
  const previous = entry;
  const comparable = previous !== null
    && previous.userId === next.userId
    && previous.date === next.date
    && publishedRemoteGen === load.remoteGen// no remote change between the two loads' starts...
    && remoteGen === load.remoteGen;// ...nor during this load
  publishedGen = load.gen;
  publishedRemoteGen = load.remoteGen;
  if (!isDeepEqual(entry, next)) {
    entry = next;
    notify();
  }
  return {accepted: true, previous, comparable};
}

// Profile's path: reuse a fresh entry, else join a running load that started after the last change,
// else load once and publish
export async function loadShared(
  userId: string,
  today: string,
  loader: () => Promise<GamificationStats>,
): Promise<SharedLoadResult> {
  if (!needsLoad(userId, today)) return {entry, source: 'reused'};
  if (inFlight && inFlight.userId === userId && inFlight.gen === gen) {
    const joined = inFlight;
    publish(await joined.promise, joined);// the starter publishes too; the second publish is a no-op
    return {entry: currentUser === userId ? entry : null, source: 'joined'};
  }
  const load = beginLoad(userId, today, loader);
  publish(await load.promise, load);
  return {entry: currentUser === userId ? entry : null, source: 'loaded'};
}
