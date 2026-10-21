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

let currentUser: string | null = null;
let entry: StatsEntry | null = null;
let gen = 0;// bumped by every local or remote change
let publishedGen = -1;// gen at which the shown entry's load started; the entry is fresh while this equals gen
let inFlight: {userId: string; gen: number; promise: Promise<StatsEntry | null>} | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

export function markStale(): void {
  gen += 1;
}

onLocalChange(markStale);
onRemoteChange(markStale);

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

// Starts a load: records gen BEFORE reading, so a change during the read leaves the result stale.
// Never rejects: resolves to null if the loader failed.
export function beginLoad(
  userId: string,
  date: string,
  loader: () => Promise<GamificationStats>,
): {gen: number; promise: Promise<StatsEntry | null>} {
  const startedGen = gen;
  const promise = loader().then(
    (stats): StatsEntry => ({userId, date, stats}),
    (err: unknown) => {
      console.log('Stats load failed', err);
      return null;
    },
  );
  const record = {userId, gen: startedGen, promise};
  inFlight = record;
  promise.finally(() => {
    if (inFlight === record) inFlight = null;
  });
  return {gen: startedGen, promise};
}

// Ignored for another user, or if a load that started later has already published.
// Notifies only if the stats really changed.
export function publish(next: StatsEntry | null, startedGen: number): void {
  if (!next || next.userId !== currentUser || startedGen < publishedGen) return;
  publishedGen = startedGen;
  if (!isDeepEqual(entry, next)) {
    entry = next;
    notify();
  }
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
    publish(await joined.promise, joined.gen);// the starter publishes too; the second publish is a no-op
    return {entry: currentUser === userId ? entry : null, source: 'joined'};
  }
  const load = beginLoad(userId, today, loader);
  publish(await load.promise, load.gen);
  return {entry: currentUser === userId ? entry : null, source: 'loaded'};
}
