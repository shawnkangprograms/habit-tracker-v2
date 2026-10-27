import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDatabase} from '@/db/database';
import {getFirebaseAuth} from '@/services/authInit';
import {homeUsable} from '@/services/startupSignals';
import {buildRecord, getMarks, TRACE_ON, type RnStartupTiming, type TraceRecord} from '@/utils/startupTrace';

// Saves this launch's startup trace (preview build only), 10 s after Home is usable so the later marks are in,
// or 30 s after startup if Home never became usable (e.g. a signed-out launch). Keeps the last 5 launches.
// AsyncStorage only: never the SQLite write queue, never the network. Fails silently.

const KEY = 'hq:startupTrace';
const LAUNCHES_KEY = 'hq:startupTrace:launches';// saved launches since install (or since Clear)
const KEEP = 5;
const AFTER_USABLE_MS = 10 * 1000;
const FALLBACK_MS = 30 * 1000;

const wallClockAtImport = Date.now();// close to the trace's first import (both evaluate at bundle start)
let started = false;
let saved = false;

function readRnStartupTiming(): RnStartupTiming | null {
  try {
    const timing = (performance as unknown as {rnStartupTiming?: RnStartupTiming}).rnStartupTiming;
    if (!timing) return null;
    return {
      startTime: timing.startTime,
      executeJavaScriptBundleEntryPointStart: timing.executeJavaScriptBundleEntryPointStart,
      endTime: timing.endTime,
    };
  } catch {
    return null;
  }
}

function hermesVersion(): string {
  const hermes = (globalThis as {HermesInternal?: {getRuntimeProperties?: () => Record<string, unknown>}}).HermesInternal;
  if (!hermes) return 'no';
  try {
    const version = hermes.getRuntimeProperties?.()['OSS Release Version'];
    return typeof version === 'string' && version.length > 0 ? version : 'yes';
  } catch {
    return 'yes';
  }
}

// Sizes only (the stats load grows with history): one plain read, after startup, never queued
async function rowCounts(): Promise<TraceRecord['counts']> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return null;
  const db = await getDatabase();
  const row: {habits: number; completions: number} | null = await db.getFirstAsync(
    `SELECT
        (SELECT COUNT(*) FROM habits WHERE userId = ? AND deleted = 0) AS habits,
        (SELECT COUNT(*) FROM completions c JOIN habits h ON h.habitId = c.habitId WHERE h.userId = ?) AS completions`,
    [uid, uid]
  );
  return row ? {habits: row.habits, completions: row.completions} : null;
}

export async function loadTraces(): Promise<TraceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TraceRecord[]) : [];
  } catch {
    return [];
  }
}

export async function clearTraces(): Promise<void> {
  await AsyncStorage.multiRemove([KEY, LAUNCHES_KEY]);
}

async function save(): Promise<void> {
  if (saved) return;
  saved = true;
  try {
    const launch = Number(await AsyncStorage.getItem(LAUNCHES_KEY) ?? '0') + 1;
    const record = buildRecord({
      launch,
      wallClockAtFirstImport: wallClockAtImport,
      marks: getMarks(),
      rn: readRnStartupTiming(),
      hermes: hermesVersion(),
      counts: await rowCounts().catch(() => null),
    });
    const kept = [record, ...(await loadTraces())].slice(0, KEEP);
    await AsyncStorage.multiSet([[KEY, JSON.stringify(kept)], [LAUNCHES_KEY, String(launch)]]);
  } catch (err) {
    console.log('Saving the startup trace failed', err);
  }
}

// Called once from app/_layout.tsx. Does nothing unless this is a trace build.
export function startTraceCapture(): void {
  if (!TRACE_ON || started) return;
  started = true;
  const fallback = setTimeout(() => { void save(); }, FALLBACK_MS);
  homeUsable.on(() => {
    clearTimeout(fallback);
    setTimeout(() => { void save(); }, AFTER_USABLE_MS);
  });
}
