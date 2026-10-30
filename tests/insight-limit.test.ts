// generateInsight limits (functions/src/dailyLimit.js) and the Gemini HTTP wrapper (functions/src/gemini.js,
// with a stub fetch: no network). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

const {decideAttempt, nairobiDay, recordSuccess} = await import('../functions/src/dailyLimit.js');
const {callGemini} = await import('../functions/src/gemini.js');
const config = await import('../functions/src/config.js');

// 2026-10-30 09:00 in Nairobi (06:00 UTC)
const NOW = Date.UTC(2026, 9, 30, 6, 0, 0);
const DAY = '2026-10-30';
const MINUTE = Math.floor(NOW / 60000);

type Usage = {day: string; attempts: number; successes: number; lastAt: number} | null;
type Daily = {count: number; minute: number; minuteCount: number} | null;

function decide(usage: Usage, daily: Daily = null, now = NOW, disabled = false) {
  return decideAttempt({disabled, usage, daily, now});
}

describe('nairobiDay', () => {
  test('rolls over at 21:00 UTC (midnight in Nairobi)', () => {
    assert.equal(nairobiDay(Date.UTC(2026, 9, 29, 20, 59, 59)), '2026-10-29');
    assert.equal(nairobiDay(Date.UTC(2026, 9, 29, 21, 0, 0)), '2026-10-30');
    assert.equal(nairobiDay(Date.UTC(2026, 11, 31, 22, 0, 0)), '2027-01-01');
  });
});

describe('decideAttempt', () => {
  test('first request of the day: allowed, counts one attempt and no success', () => {
    assert.deepEqual(decide(null), {
      action: 'allow',
      day: DAY,
      usage: {day: DAY, attempts: 1, successes: 0, lastAt: NOW},
      daily: {count: 1, minute: MINUTE, minuteCount: 1},
    });
  });

  test('a disabled account is refused before anything else', () => {
    assert.deepEqual(decide(null, null, NOW, true), {action: 'disabled'});
  });

  test('after a success the same Nairobi day is refused; the next day is allowed', () => {
    const used = {day: DAY, attempts: 1, successes: 1, lastAt: NOW};
    assert.deepEqual(decide(used), {action: 'limit'});
    const nextDay = Date.UTC(2026, 9, 30, 21, 0, 0);
    assert.equal(decide(used, null, nextDay).action, 'allow');
  });

  test('failed attempts keep the slot: up to 3 attempts, then limit', () => {
    let usage: Usage = null;
    for (let i = 1; i <= config.ATTEMPTS_PER_USER_PER_DAY; i++) {
      const d = decide(usage);
      assert.equal(d.action, 'allow', `attempt ${i}`);
      if (d.action === 'allow') usage = d.usage;// the model call then fails: no recordSuccess
    }
    assert.equal(usage?.successes, 0);
    assert.deepEqual(decide(usage), {action: 'limit'});
  });

  test('the global day cap counts attempts and refuses with busy, writing nothing', () => {
    assert.equal(decide(null, {count: config.GLOBAL_ATTEMPTS_PER_DAY - 1, minute: 0, minuteCount: 0}).action, 'allow');
    assert.deepEqual(decide(null, {count: config.GLOBAL_ATTEMPTS_PER_DAY, minute: 0, minuteCount: 0}), {action: 'busy'});
  });

  test('the per-minute cap applies only within the same minute', () => {
    const full = {count: 50, minute: MINUTE, minuteCount: config.GLOBAL_ATTEMPTS_PER_MINUTE};
    assert.deepEqual(decide(null, full), {action: 'busy'});
    const next = decide(null, full, NOW + 60000);
    assert.equal(next.action, 'allow');
    if (next.action === 'allow') assert.deepEqual(next.daily, {count: 51, minute: MINUTE + 1, minuteCount: 1});
  });

  test('a user refused with busy has not used an attempt', () => {
    const usage = {day: DAY, attempts: 2, successes: 0, lastAt: NOW - 1000};
    assert.deepEqual(decide(usage, {count: config.GLOBAL_ATTEMPTS_PER_DAY, minute: 0, minuteCount: 0}), {action: 'busy'});
    const later = decide(usage, {count: 0, minute: 0, minuteCount: 0});
    assert.equal(later.action === 'allow' && later.usage.attempts, 3);
  });

  test('counters from another day, or malformed, count as zero', () => {
    const old = decide({day: '2026-10-29', attempts: 3, successes: 1, lastAt: 0});
    assert.equal(old.action === 'allow' && old.usage.attempts, 1);
    const junk = decide({day: DAY, attempts: -4, successes: 'x' as unknown as number, lastAt: 0}, {count: 1.5, minute: MINUTE, minuteCount: -1});
    assert.equal(junk.action, 'allow');
    if (junk.action === 'allow') {
      assert.deepEqual(junk.usage, {day: DAY, attempts: 1, successes: 0, lastAt: NOW});
      assert.deepEqual(junk.daily, {count: 1, minute: MINUTE, minuteCount: 1});
    }
  });
});

describe('recordSuccess', () => {
  test('uses the slot and keeps the attempts counted meanwhile', () => {
    assert.deepEqual(recordSuccess({day: DAY, attempts: 2, successes: 0, lastAt: 1}, DAY, NOW),
      {day: DAY, attempts: 2, successes: 1, lastAt: NOW});
  });

  test('a doc from another day starts fresh', () => {
    assert.deepEqual(recordSuccess({day: '2026-10-29', attempts: 3, successes: 1, lastAt: 1}, DAY, NOW),
      {day: DAY, attempts: 0, successes: 1, lastAt: NOW});
  });
});

describe('callGemini', () => {
  const KEY = 'test-key-123';
  type Call = {url: string; init: RequestInit};

  function stub(make: () => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({url, init});
      return make();
    };
    return {calls, fetchImpl: fetchImpl as unknown as typeof fetch};
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

  test('one POST to the model URL, key in the header only', async () => {
    const {calls, fetchImpl} = stub(() => json(200, {candidates: []}));
    const res = await callGemini({apiKey: KEY, body: {a: 1}, fetchImpl});
    assert.deepEqual(res, {ok: true, status: 200, json: {candidates: []}});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, config.GEMINI_URL);
    assert.doesNotMatch(calls[0].url, /key/);
    assert.equal((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], KEY);
    assert.equal(calls[0].init.method, 'POST');
  });

  test('429, 5xx and 4xx become reasons, with no retry', async () => {
    for (const [status, reason] of [[429, 'http_429'], [503, 'http_5xx'], [404, 'http_4xx']] as const) {
      const {calls, fetchImpl} = stub(() => json(status, {error: {message: 'nope'}}));
      assert.deepEqual(await callGemini({apiKey: KEY, body: {}, fetchImpl}), {ok: false, reason, status, message: 'nope'});
      assert.equal(calls.length, 1);
    }
  });

  test('a non-JSON success body is bad_json', async () => {
    const {fetchImpl} = stub(() => new Response('<html>', {status: 200}));
    assert.deepEqual(await callGemini({apiKey: KEY, body: {}, fetchImpl}), {ok: false, reason: 'bad_json', status: 200, message: null});
  });

  test('a timeout and a network failure', async () => {
    // AbortSignal.timeout's timer does not keep Node's event loop alive, so the hanging stub holds its own
    const hang = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => {}, 5000);
      init.signal!.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(init.signal!.reason);
      });
    })) as unknown as typeof fetch;
    const timedOut = await callGemini({apiKey: KEY, body: {}, fetchImpl: hang, timeoutMs: 20});
    assert.deepEqual(timedOut, {ok: false, reason: 'timeout', status: null, message: null});
    const {fetchImpl} = stub(() => {
      throw new TypeError('fetch failed');
    });
    assert.deepEqual(await callGemini({apiKey: KEY, body: {}, fetchImpl}), {ok: false, reason: 'network', status: null, message: null});
  });
});
