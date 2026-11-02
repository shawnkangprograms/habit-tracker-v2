// When the Home insight card asks generateInsight for a new insight, what it does with each answer, and what
// the card shows. Pure: no React, React Native or Firebase; every dependency is injected, so this runs under
// Node's test runner (including the catch paths).
//
// Rules:
// - At most one request per local day per user (getLocalDateString; the server enforces the Nairobi day).
//   A cached insight for today, or a recorded attempt today, means no request.
// - Only when Firebase has confirmed the user (never on a presumed uid), no request is in flight, and no wait
//   is running.
// - ok: cache it with its day. limit, or a refusal error (invalid-argument, permission-denied, not-found,
//   failed-precondition): record today as attempted, no retry today.
// - Waits, in memory only: busy 60 min; a server failure (status unavailable, a malformed ok, anything
//   unexpected) 30 min; network-type errors 30 min. The server's 3 attempts per user per day are the final
//   limit: after them it answers limit, which ends the day.
// - With nothing cached, "Check back once you're online" is only for a network wait (or Firebase not having
//   confirmed the user yet); during a server or busy wait the card is hidden.
// - Nothing here ever throws to the caller: any failure leaves the card hidden or on its last good state.

import {fromDayNumber, isDateString, toDayNumber, weekdayOf} from '@/utils/gamification';
import type {InsightInputResult, InsightRequest} from '@/utils/insightInput';

export const TEASER_MAX = 90;
export const DETAIL_MAX = 600;
export const BUSY_WAIT_MS = 60 * 60 * 1000;
export const NETWORK_WAIT_MS = 30 * 60 * 1000;
export const SERVER_WAIT_MS = 30 * 60 * 1000;

export const MESSAGES = {
  online: 'Check back once you\'re online for your first insight.',
  firstAfterThreeDays: 'Your first insight arrives after 3 days of tracking.',
  tomorrow: 'Your next insight arrives tomorrow.',
} as const;

export type Insight = {day: string; teaser: string; detail: string};
// Why the day's tries ended without an insight. ('unavailable' was stored by an older build for a server
// failure; services/insightCache.ts drops it on read, so those users are retried.)
export type AttemptStatus = 'limit' | 'refused';

// What services/insightCache.ts stores per uid
export type CacheEntry = {
  v: 1;
  insight: Insight | null;// the latest good insight, kept until a newer one arrives
  attemptedDay: string | null;// local day of the last attempt that ended the day's tries
  attemptStatus: AttemptStatus | null;// why the attempt on attemptedDay found nothing ('ok' leaves null)
};

export const EMPTY_ENTRY: CacheEntry = {v: 1, insight: null, attemptedDay: null, attemptStatus: null};

// 'pending' until the first request check has run (the card stays hidden meanwhile)
export type Phase = 'pending' | 'idle' | 'inFlight' | 'waiting';
export type Eligibility = 'unknown' | 'eligible' | 'notEnoughData';
export type WaitReason = 'busy' | 'network' | 'server';
export type Wait = {until: number; reason: WaitReason};

export type InsightView = {
  cacheRead: boolean;
  entry: CacheEntry;
  eligibility: Eligibility;
  phase: Phase;
  waitReason: WaitReason | null;// set while phase is 'waiting'
};

export type Outcome =
  | {kind: 'ok'; insight: Insight}
  | {kind: 'attempted'; status: AttemptStatus}
  | {kind: 'wait'; ms: number; reason: WaitReason};

function codePoints(s: string): number {
  return [...s].length;
}

// A cached or returned insight is shown only if it has this exact shape
export function isInsight(value: unknown): value is Insight {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return isDateString(v.day)
    && typeof v.teaser === 'string' && v.teaser.trim() !== '' && codePoints(v.teaser) <= TEASER_MAX
    && typeof v.detail === 'string' && v.detail.trim() !== '' && codePoints(v.detail) <= DETAIL_MAX;
}

// Today's insight is already here, or today's tries are over
export function needsInsight(entry: CacheEntry, today: string): boolean {
  return entry.insight?.day !== today && entry.attemptedDay !== today;
}

export function canCallNow(s: {now: number; waitUntil: number | null; authConfirmed: boolean; inFlight: boolean}): boolean {
  return s.authConfirmed && !s.inFlight && (s.waitUntil === null || s.now >= s.waitUntil);
}

// Errors the function throws on purpose: retrying today would get the same answer
const REFUSAL_CODES = new Set(['invalid-argument', 'permission-denied', 'not-found', 'failed-precondition']);

// The callable's resolved data, or the error it rejected with
export function classifyResult(result: {data: unknown} | {error: unknown}): Outcome {
  if ('error' in result) {
    const raw = (result.error as {code?: unknown} | null)?.code;
    const code = typeof raw === 'string' ? raw.replace(/^functions\//, '') : '';
    if (REFUSAL_CODES.has(code)) return {kind: 'attempted', status: 'refused'};
    return {kind: 'wait', ms: NETWORK_WAIT_MS, reason: 'network'};// unavailable, deadline-exceeded, internal, unknown...
  }
  const data = result.data as {status?: unknown; day?: unknown; teaser?: unknown; detail?: unknown} | null;
  const status = data?.status;
  if (status === 'ok') {
    const insight = {day: data?.day, teaser: data?.teaser, detail: data?.detail};
    if (isInsight(insight)) return {kind: 'ok', insight: {day: insight.day, teaser: insight.teaser.trim(), detail: insight.detail.trim()}};
  }
  if (status === 'limit') return {kind: 'attempted', status: 'limit'};
  if (status === 'busy') return {kind: 'wait', ms: BUSY_WAIT_MS, reason: 'busy'};
  // 'unavailable' (e.g. the model's answer failed validation), a malformed ok, or anything unexpected:
  // try again later today; the server's attempt cap decides when the day ends
  return {kind: 'wait', ms: SERVER_WAIT_MS, reason: 'server'};
}

export type CardContent =
  | {kind: 'hidden'}
  | {kind: 'insight'; insight: Insight; label: string}
  | {kind: 'message'; text: string};

export function cardContent(view: InsightView, today: string): CardContent {
  if (!view.cacheRead) return {kind: 'hidden'};
  const {entry} = view;
  if (entry.insight) return {kind: 'insight', insight: entry.insight, label: insightDayLabel(entry.insight.day, today)};
  if (entry.attemptedDay === today) return {kind: 'message', text: MESSAGES.tomorrow};
  if (view.eligibility === 'notEnoughData') return {kind: 'message', text: MESSAGES.firstAfterThreeDays};
  if (view.phase === 'pending' || view.phase === 'inFlight') return {kind: 'hidden'};
  // a server failure or busy: the phone is online, so the online message would be wrong; retried quietly
  if (view.phase === 'waiting' && view.waitReason !== 'network') return {kind: 'hidden'};
  return {kind: 'message', text: MESSAGES.online};// waiting after a network error, or not signed in to Firebase yet
}

const SHORT_DAYS = {mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'} as const;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Today", "Yesterday" or "From Tue 28 Oct", from YYYY-MM-DD strings only (no Date in the device time zone)
export function insightDayLabel(day: string, today: string): string {
  const n = toDayNumber(day);
  const todayN = toDayNumber(today);
  if (n >= todayN) return 'Today';// a server day ahead of the phone's (another time zone) is still today's
  if (n === todayN - 1) return 'Yesterday';
  const [, month, date] = fromDayNumber(n).split('-').map(Number);
  return `From ${SHORT_DAYS[weekdayOf(n)]} ${date} ${SHORT_MONTHS[month - 1]}`;
}

export type RunnerDeps = {
  uid: string;
  readCache: (uid: string) => Promise<CacheEntry | null>;
  writeCache: (uid: string, entry: CacheEntry) => Promise<void>;
  buildRequest: () => Promise<InsightInputResult>;
  call: (request: InsightRequest) => Promise<unknown>;// resolves to the callable's data, rejects with its error
  isAuthConfirmed: () => boolean;
  today: () => string;
  now: () => number;
  waits: Map<string, Wait>;// per uid, shared by every runner (module level in the app)
  inFlight: Set<string>;// uids with a request running, shared the same way
  onChange: (view: InsightView) => void;
  mark?: (name: 'insight:cacheRead' | 'insight:requestStart' | 'insight:requestEnd') => void;
  log?: (message: string, err?: unknown) => void;
};

// One runner per mounted card (per uid). readCache and start never reject; after dispose nothing calls onChange.
export function createInsightRunner(deps: RunnerDeps) {
  let view: InsightView = {cacheRead: false, entry: EMPTY_ENTRY, eligibility: 'unknown', phase: 'pending', waitReason: null};
  let eligibilityDay: string | null = null;
  let started = false;
  let disposed = false;
  let cacheRead: Promise<void> | null = null;
  const log = (message: string, err?: unknown) => {
    try {
      deps.log?.(message, err);
    } catch {
      // logging must never break the card
    }
  };

  function update(next: Partial<InsightView>) {
    view = {...view, ...next};
    if (disposed) return;
    try {
      deps.onChange(view);
    } catch (err) {
      log('Insight view update failed', err);
    }
  }

  function readCache(): Promise<void> {
    if (!cacheRead) {
      cacheRead = (async () => {
        let entry: CacheEntry = EMPTY_ENTRY;
        try {
          entry = (await deps.readCache(deps.uid)) ?? EMPTY_ENTRY;
        } catch (err) {
          log('Insight cache read failed', err);
        }
        deps.mark?.('insight:cacheRead');
        update({cacheRead: true, entry});
      })();
    }
    return cacheRead;
  }

  async function save(entry: CacheEntry) {
    update({entry});
    try {
      await deps.writeCache(deps.uid, entry);
    } catch (err) {
      log('Insight cache write failed', err);
    }
  }

  async function check(): Promise<void> {
    const {uid} = deps;
    const today = deps.today();
    if (!needsInsight(view.entry, today)) {
      update({phase: 'idle', waitReason: null});
      return;
    }
    const wait = deps.waits.get(uid) ?? null;
    const waiting = wait !== null && deps.now() < wait.until;
    // not calling now: 'waiting' (with why) while a wait runs, otherwise 'idle'
    const notCalling: Partial<InsightView> = waiting ? {phase: 'waiting', waitReason: wait.reason} : {phase: 'idle', waitReason: null};
    const callable = canCallNow({now: deps.now(), waitUntil: wait?.until ?? null, authConfirmed: deps.isAuthConfirmed(), inFlight: deps.inFlight.has(uid)});
    // Read the rows only when a call can go out, or once a day to know which message to show
    if (!callable && eligibilityDay === today) {
      update(notCalling);
      return;
    }
    const built = await deps.buildRequest();
    eligibilityDay = today;
    if (!built.ok) {
      update({eligibility: 'notEnoughData', phase: 'idle', waitReason: null});
      return;
    }
    if (!callable) {
      update({eligibility: 'eligible', ...notCalling});
      return;
    }

    deps.inFlight.add(uid);
    update({eligibility: 'eligible', phase: 'inFlight', waitReason: null});
    let outcome: Outcome;
    try {
      deps.mark?.('insight:requestStart');
      outcome = classifyResult({data: await deps.call(built.request)});
    } catch (error) {
      outcome = classifyResult({error});
    } finally {
      deps.inFlight.delete(uid);
      deps.mark?.('insight:requestEnd');
    }
    if (outcome.kind === 'ok') {
      await save({v: 1, insight: outcome.insight, attemptedDay: today, attemptStatus: null});
      update({phase: 'idle'});
    } else if (outcome.kind === 'attempted') {
      await save({...view.entry, attemptedDay: today, attemptStatus: outcome.status});
      update({phase: 'idle'});
    } else {
      deps.waits.set(uid, {until: deps.now() + outcome.ms, reason: outcome.reason});
      update({phase: 'waiting', waitReason: outcome.reason});
    }
  }

  // Re-checks whether a request is due. Does nothing before start() and while a check is running.
  let checking = false;
  async function maybeRequest(): Promise<void> {
    if (!started || disposed || checking) return;
    checking = true;
    try {
      await readCache();
      await check();
    } catch (err) {
      log('Insight check failed', err);
      if (view.phase === 'pending' || view.phase === 'inFlight') update({phase: 'idle'});
    } finally {
      checking = false;
    }
  }

  function start(): Promise<void> {
    started = true;
    return maybeRequest();
  }

  return {
    readCache,
    start,
    maybeRequest,
    view: () => view,
    dispose: () => {
      disposed = true;
    },
  };
}

export type InsightRunner = ReturnType<typeof createInsightRunner>;
