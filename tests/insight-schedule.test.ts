// When the insight card requests, what it does with each answer, what it shows, and that nothing in the runner
// ever throws (utils/insightSchedule.ts). Fake dependencies, no network. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {CacheEntry, InsightView, RunnerDeps} from '@/utils/insightSchedule';
import type {InsightInputResult, InsightRequest} from '@/utils/insightInput';

const S = await import('../utils/insightSchedule.ts');
const {BUSY_WAIT_MS, NETWORK_WAIT_MS, MESSAGES, EMPTY_ENTRY} = S;

const TODAY = '2026-10-29';
const INSIGHT = {day: TODAY, teaser: 'Hydration is your anchor.', detail: 'You drank water 18 of 21 days.'};
const REQUEST: InsightRequest = {v: 1, trackedDays: 21, streak: 4, bestWeekday: null,
  habits: [{icon: 'water', freq: 'daily', daysPerWeek: 7, done: 18, scheduled: 21}]};

const entry = (over: Partial<CacheEntry> = {}): CacheEntry => ({...EMPTY_ENTRY, ...over});
const view = (over: Partial<InsightView> = {}): InsightView =>
  ({cacheRead: true, entry: EMPTY_ENTRY, eligibility: 'unknown', phase: 'idle', ...over});

describe('needsInsight and canCallNow', () => {
  test('a request is needed unless today is cached or attempted', () => {
    assert.equal(S.needsInsight(EMPTY_ENTRY, TODAY), true);
    assert.equal(S.needsInsight(entry({insight: {...INSIGHT, day: '2026-10-28'}}), TODAY), true);
    assert.equal(S.needsInsight(entry({attemptedDay: '2026-10-28', attemptStatus: 'limit'}), TODAY), true);
    assert.equal(S.needsInsight(entry({insight: INSIGHT}), TODAY), false);
    assert.equal(S.needsInsight(entry({attemptedDay: TODAY, attemptStatus: 'unavailable'}), TODAY), false);
  });

  test('a call goes out only when confirmed, idle and not waiting', () => {
    const ok = {now: 1000, waitUntil: null, authConfirmed: true, inFlight: false};
    assert.equal(S.canCallNow(ok), true);
    assert.equal(S.canCallNow({...ok, authConfirmed: false}), false);// presumed uid
    assert.equal(S.canCallNow({...ok, inFlight: true}), false);
    assert.equal(S.canCallNow({...ok, waitUntil: 1001}), false);
    assert.equal(S.canCallNow({...ok, waitUntil: 1000}), true);
  });
});

describe('classifyResult', () => {
  test('a valid ok is kept (trimmed); a malformed ok counts as unavailable', () => {
    assert.deepEqual(S.classifyResult({data: {status: 'ok', ...INSIGHT, teaser: ` ${INSIGHT.teaser} `}}), {kind: 'ok', insight: INSIGHT});
    for (const bad of [{teaser: 'x'.repeat(91)}, {detail: 'x'.repeat(601)}, {day: '29/10/2026'}, {teaser: '  '}, {detail: 5}]) {
      assert.deepEqual(S.classifyResult({data: {status: 'ok', ...INSIGHT, ...bad}}), {kind: 'attempted', status: 'unavailable'});
    }
  });

  test('limit and unavailable end the day; busy waits 60 min; anything unexpected ends the day', () => {
    assert.deepEqual(S.classifyResult({data: {status: 'limit'}}), {kind: 'attempted', status: 'limit'});
    assert.deepEqual(S.classifyResult({data: {status: 'unavailable'}}), {kind: 'attempted', status: 'unavailable'});
    assert.deepEqual(S.classifyResult({data: {status: 'busy'}}), {kind: 'wait', ms: BUSY_WAIT_MS, reason: 'busy'});
    for (const data of [null, undefined, 'ok', {status: 'great'}]) {
      assert.deepEqual(S.classifyResult({data}), {kind: 'attempted', status: 'unavailable'});
    }
  });

  test('refusal errors end the day; network-type errors wait 30 min', () => {
    for (const code of ['functions/invalid-argument', 'functions/permission-denied', 'functions/not-found', 'functions/failed-precondition']) {
      assert.deepEqual(S.classifyResult({error: {code}}), {kind: 'attempted', status: 'unavailable'}, code);
    }
    const errors = [{code: 'functions/unavailable'}, {code: 'functions/deadline-exceeded'}, {code: 'functions/internal'},
      {code: 'functions/unauthenticated'}, new Error('boom'), null, 'text'];
    for (const error of errors) {
      assert.deepEqual(S.classifyResult({error}), {kind: 'wait', ms: NETWORK_WAIT_MS, reason: 'network'});
    }
  });
});

describe('cardContent', () => {
  test('hidden until the cache is read, and while the first request is pending or in flight', () => {
    assert.deepEqual(S.cardContent(view({cacheRead: false, entry: entry({insight: INSIGHT})}), TODAY), {kind: 'hidden'});
    assert.deepEqual(S.cardContent(view({phase: 'pending'}), TODAY), {kind: 'hidden'});
    assert.deepEqual(S.cardContent(view({phase: 'inFlight', eligibility: 'eligible'}), TODAY), {kind: 'hidden'});
  });

  test('a cached insight always shows, with its day, even while a newer one is requested', () => {
    const old = {...INSIGHT, day: '2026-10-27'};
    assert.deepEqual(S.cardContent(view({entry: entry({insight: old}), phase: 'inFlight'}), TODAY),
      {kind: 'insight', insight: old, label: 'From Tue 27 Oct'});
  });

  test('the three messages', () => {
    assert.deepEqual(S.cardContent(view({entry: entry({attemptedDay: TODAY, attemptStatus: 'limit'})}), TODAY), {kind: 'message', text: MESSAGES.tomorrow});
    assert.deepEqual(S.cardContent(view({entry: entry({attemptedDay: TODAY, attemptStatus: 'unavailable'})}), TODAY), {kind: 'message', text: MESSAGES.tomorrow});
    assert.deepEqual(S.cardContent(view({eligibility: 'notEnoughData'}), TODAY), {kind: 'message', text: MESSAGES.firstAfterThreeDays});
    assert.deepEqual(S.cardContent(view({phase: 'waiting', eligibility: 'eligible'}), TODAY), {kind: 'message', text: MESSAGES.online});
    assert.deepEqual(S.cardContent(view({phase: 'idle'}), TODAY), {kind: 'message', text: MESSAGES.online});// not confirmed yet
  });

  test('yesterday\'s attempt does not say tomorrow today', () => {
    const content = S.cardContent(view({entry: entry({attemptedDay: '2026-10-28', attemptStatus: 'limit'}), phase: 'waiting'}), TODAY);
    assert.deepEqual(content, {kind: 'message', text: MESSAGES.online});
  });
});

describe('insightDayLabel', () => {
  test('Today, Yesterday, then the date', () => {
    assert.equal(S.insightDayLabel(TODAY, TODAY), 'Today');
    assert.equal(S.insightDayLabel('2026-10-30', TODAY), 'Today');// the server day ahead of the phone
    assert.equal(S.insightDayLabel('2026-10-28', TODAY), 'Yesterday');
    assert.equal(S.insightDayLabel('2026-10-27', TODAY), 'From Tue 27 Oct');
    assert.equal(S.insightDayLabel('2026-09-30', TODAY), 'From Wed 30 Sep');
    assert.equal(S.insightDayLabel('2026-12-31', '2027-01-02'), 'From Thu 31 Dec');
  });
});

// ---------- the runner, with fake dependencies ----------

type Fake = {
  deps: RunnerDeps;
  views: InsightView[];
  calls: InsightRequest[];
  stored: Map<string, CacheEntry>;
  logs: string[];
  clock: {now: number; today: string};
};

function fake(over: Partial<RunnerDeps> = {}, answers: (() => Promise<unknown>)[] = []): Fake {
  const views: InsightView[] = [];
  const calls: InsightRequest[] = [];
  const stored = new Map<string, CacheEntry>();
  const logs: string[] = [];
  const clock = {now: 1_000_000, today: TODAY};
  const deps: RunnerDeps = {
    uid: 'u1',
    readCache: async (uid) => stored.get(uid) ?? null,
    writeCache: async (uid, e) => {
      stored.set(uid, e);
    },
    buildRequest: async (): Promise<InsightInputResult> => ({ok: true, request: REQUEST}),
    call: (request) => {
      calls.push(request);
      const next = answers.shift();
      return next ? next() : Promise.resolve({status: 'ok', ...INSIGHT});
    },
    isAuthConfirmed: () => true,
    today: () => clock.today,
    now: () => clock.now,
    waits: new Map(),
    inFlight: new Set(),
    onChange: (v) => views.push(v),
    log: (message) => logs.push(message),
    ...over,
  };
  return {deps, views, calls, stored, logs, clock};
}

const last = (f: Fake) => f.views[f.views.length - 1];

describe('createInsightRunner', () => {
  test('reads the cache first; nothing is requested before start()', async () => {
    const f = fake();
    const runner = S.createInsightRunner(f.deps);
    await runner.readCache();
    await runner.maybeRequest();
    assert.equal(f.calls.length, 0);
    assert.deepEqual(last(f), view({phase: 'pending'}));
  });

  test('ok: one call, cached with its day; no second call the same day; a new call the next day', async () => {
    const f = fake();
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.stored.get('u1'), {v: 1, insight: INSIGHT, attemptedDay: TODAY, attemptStatus: null});
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'insight', insight: INSIGHT, label: 'Today'});
    await runner.maybeRequest();
    assert.equal(f.calls.length, 1);
    f.clock.today = '2026-10-30';
    await runner.maybeRequest();
    assert.equal(f.calls.length, 2);
  });

  test('a cached insight for today shows without any call (offline too)', async () => {
    const f = fake({isAuthConfirmed: () => false});
    f.stored.set('u1', entry({insight: INSIGHT, attemptedDay: TODAY}));
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.equal(f.calls.length, 0);
    assert.equal(S.cardContent(last(f), TODAY).kind, 'insight');
  });

  test('presumed uid: no call, the online message; confirmed later: the call goes out', async () => {
    let confirmed = false;
    const f = fake({isAuthConfirmed: () => confirmed});
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.equal(f.calls.length, 0);
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'message', text: MESSAGES.online});
    confirmed = true;
    await runner.maybeRequest();
    assert.equal(f.calls.length, 1);
  });

  test('not enough data: no call, the 3-days message, and the rows are read once a day', async () => {
    let builds = 0;
    const f = fake({isAuthConfirmed: () => false, buildRequest: async () => {
      builds += 1;
      return {ok: false, reason: 'notEnoughData'};
    }});
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    await runner.maybeRequest();
    assert.equal(f.calls.length, 0);
    assert.equal(builds, 1);
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'message', text: MESSAGES.firstAfterThreeDays});
  });

  test('limit: today is recorded as attempted (saved), no retry today', async () => {
    const f = fake({}, [async () => ({status: 'limit'})]);
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    await runner.maybeRequest();
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.stored.get('u1'), {v: 1, insight: null, attemptedDay: TODAY, attemptStatus: 'limit'});
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'message', text: MESSAGES.tomorrow});
  });

  test('unavailable keeps the previous insight on screen', async () => {
    const old = {...INSIGHT, day: '2026-10-27'};
    const f = fake({}, [async () => ({status: 'unavailable'})]);
    f.stored.set('u1', entry({insight: old}));
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.deepEqual(f.stored.get('u1'), {v: 1, insight: old, attemptedDay: TODAY, attemptStatus: 'unavailable'});
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'insight', insight: old, label: 'From Tue 27 Oct'});
  });

  test('busy waits 60 min, a network error 30 min, in memory only', async () => {
    const f = fake({}, [async () => ({status: 'busy'}), async () => {
      throw {code: 'functions/unavailable'};
    }]);
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.equal(f.deps.waits.get('u1'), f.clock.now + BUSY_WAIT_MS);
    assert.equal(f.stored.has('u1'), false);
    await runner.maybeRequest();
    assert.equal(f.calls.length, 1);// still waiting
    assert.equal(last(f).phase, 'waiting');
    f.clock.now += BUSY_WAIT_MS;
    await runner.maybeRequest();
    assert.equal(f.calls.length, 2);
    assert.equal(f.deps.waits.get('u1'), f.clock.now + NETWORK_WAIT_MS);
    assert.deepEqual(S.cardContent(last(f), TODAY), {kind: 'message', text: MESSAGES.online});
  });

  test('a request already in flight for this uid (another mount) blocks a second call', async () => {
    const f = fake();
    f.deps.inFlight.add('u1');
    await S.createInsightRunner(f.deps).start();
    assert.equal(f.calls.length, 0);
  });

  test('checks never overlap: a check while one is running does nothing', async () => {
    let release!: (v: unknown) => void;
    const f = fake({}, [() => new Promise((resolve) => {
      release = resolve;
    })]);
    const runner = S.createInsightRunner(f.deps);
    const first = runner.start();
    await new Promise((r) => setImmediate(r));
    await runner.maybeRequest();
    release({status: 'ok', ...INSIGHT});
    await first;
    assert.equal(f.calls.length, 1);
  });

  test('after dispose, a late answer is saved for its uid but never shown', async () => {
    let release!: (v: unknown) => void;
    const f = fake({}, [() => new Promise((resolve) => {
      release = resolve;
    })]);
    const runner = S.createInsightRunner(f.deps);
    const run = runner.start();
    await new Promise((r) => setImmediate(r));
    const shown = f.views.length;
    runner.dispose();
    release({status: 'ok', ...INSIGHT});
    await run;
    assert.equal(f.views.length, shown);
    assert.equal(f.stored.get('u1')?.insight?.day, TODAY);
  });
});

describe('createInsightRunner never throws (catch paths)', () => {
  test('cache read throws: treated as empty, the card still works', async () => {
    const f = fake({readCache: async () => {
      throw new Error('storage broken');
    }});
    const runner = S.createInsightRunner(f.deps);
    await runner.start();
    assert.equal(last(f).cacheRead, true);
    assert.equal(f.calls.length, 1);
    assert.ok(f.logs.includes('Insight cache read failed'));
  });

  test('building the request throws: no call, no rejection, the card leaves pending', async () => {
    const f = fake({buildRequest: async () => {
      throw new Error('db closed');
    }});
    const runner = S.createInsightRunner(f.deps);
    await assert.doesNotReject(runner.start());
    assert.equal(f.calls.length, 0);
    assert.equal(last(f).phase, 'idle');
    assert.ok(f.logs.includes('Insight check failed'));
  });

  test('the call throws synchronously: treated as a network error', async () => {
    const f = fake({call: () => {
      throw new TypeError('not a function');
    }});
    await assert.doesNotReject(S.createInsightRunner(f.deps).start());
    assert.equal(f.deps.waits.get('u1'), f.clock.now + NETWORK_WAIT_MS);
    assert.equal(f.deps.inFlight.has('u1'), false);
  });

  test('the cache write throws: the insight is still shown', async () => {
    const f = fake({writeCache: async () => {
      throw new Error('disk full');
    }});
    await assert.doesNotReject(S.createInsightRunner(f.deps).start());
    assert.equal(S.cardContent(last(f), TODAY).kind, 'insight');
    assert.ok(f.logs.includes('Insight cache write failed'));
  });

  test('the view listener throws: the runner carries on', async () => {
    const f = fake({onChange: () => {
      throw new Error('setState after unmount');
    }});
    const runner = S.createInsightRunner(f.deps);
    await assert.doesNotReject(runner.start());
    assert.equal(f.calls.length, 1);
    assert.equal(runner.view().entry.insight?.day, TODAY);
  });

  test('the clock or auth check throws: no rejection, the card leaves pending', async () => {
    const f = fake({isAuthConfirmed: () => {
      throw new Error('auth not ready');
    }});
    const runner = S.createInsightRunner(f.deps);
    await assert.doesNotReject(runner.start());
    assert.equal(f.calls.length, 0);
    assert.equal(runner.view().phase, 'idle');
  });
});
