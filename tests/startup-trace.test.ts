// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecord, chooseBase, createStartupTrace, gateHeldBy, summarise, TRACE_ON, traceToText, type Marks,
} from '../utils/startupTrace.ts';
import {createOnceSignal} from '../services/startupSignals.ts';

function clock(...times: number[]) {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
}

describe('startup trace marks', () => {
  test('the flag is off unless the build sets it', () => {
    assert.equal(TRACE_ON, false);
  });

  test('disabled: mark records nothing', () => {
    const trace = createStartupTrace({enabled: false, now: clock(5)});
    trace.mark('home:usable');
    assert.deepEqual(trace.marks(), {});
  });

  test('enabled: only the first call of a name counts', () => {
    const trace = createStartupTrace({enabled: true, now: clock(10, 20, 30)});
    trace.mark('db:ready');
    trace.mark('db:ready');
    trace.mark('fonts:ready');
    assert.deepEqual(trace.marks(), {'db:ready': 10, 'fonts:ready': 20});
  });
});

describe('chooseBase', () => {
  test('uses rnStartupTiming when it is on the same clock', () => {
    const base = chooseBase(1500, {executeJavaScriptBundleEntryPointStart: 1000, endTime: 1800});
    assert.deepEqual(base, {base: 'rnStartupTiming', at: 1000, rnEnd: 1800});
  });

  test('falls back to the first import when rn starts after it (another clock)', () => {
    assert.deepEqual(chooseBase(1500, {executeJavaScriptBundleEntryPointStart: 9e9, endTime: 9e9}),
      {base: 'firstImport', at: 1500, rnEnd: null});
  });

  test('falls back when rn timing is missing, NaN or implausibly early', () => {
    for (const rn of [null, {executeJavaScriptBundleEntryPointStart: NaN, startTime: NaN}, {executeJavaScriptBundleEntryPointStart: 1}]) {
      assert.equal(chooseBase(60000, rn).base, 'firstImport');
    }
  });

  test('a bad endTime is dropped but the start is kept', () => {
    assert.deepEqual(chooseBase(1500, {executeJavaScriptBundleEntryPointStart: 1000, endTime: 500}),
      {base: 'rnStartupTiming', at: 1000, rnEnd: null});
  });
});

describe('records and phases', () => {
  const marks: Marks = {
    'trace:firstImport': 1400, 'layout:rootEvaluated': 1900, 'root:firstCommit': 2000, 'auth:initStart': 1450,
    'auth:firstCallback': 3500, 'db:ready': 2100, 'fonts:ready': 2300, 'gate:open': 3550,
    'home:mount': 3900, 'home:usable': 4200, 'stats:published': 4400,
  };
  const record = buildRecord({
    launch: 2, wallClockAtFirstImport: 0, marks, rn: {executeJavaScriptBundleEntryPointStart: 1000, endTime: 1950},
    hermes: 'yes', counts: {habits: 3, completions: 40},
  });

  test('marks are stored relative to the bundle start, in whole ms', () => {
    assert.equal(record.base, 'rnStartupTiming');
    assert.equal(record.marks['home:usable'], 3200);
    assert.equal(record.rnEvalEnd, 950);
  });

  test('the gate is held by whichever of auth, db and fonts finished last', () => {
    assert.equal(gateHeldBy(record.marks), 'auth');
    assert.equal(gateHeldBy({'db:ready': 9, 'fonts:ready': 3}), 'db');
    assert.equal(gateHeldBy({}), null);
  });

  test('summarise: JS span, gate wait and Home phases; missing marks are null', () => {
    const rows = new Map(summarise(record).map((r) => [r.label, r]));
    assert.equal(rows.get('JS span: bundle start to usable')?.ms, 3200);
    assert.equal(rows.get('Gate wait (first commit to gate open)')?.ms, 1550);
    assert.equal(rows.get('Gate wait (first commit to gate open)')?.note, 'held by auth');
    assert.equal(rows.get('Home data (mount to usable)')?.ms, 300);
    assert.equal(rows.get('Stats published')?.ms, 200);
    assert.equal(rows.get('Sync first cycle ended')?.ms, null);
  });

  test('the share text has no habit names, only counts', () => {
    const text = traceToText([record]);
    assert.match(text, /Launch 2/);
    assert.match(text, /3 habits, 40 completion rows/);
  });
});

describe('createOnceSignal', () => {
  test('fires listeners once; a listener added later runs at once', () => {
    const signal = createOnceSignal();
    const calls: string[] = [];
    signal.on(() => calls.push('early'));
    signal.fire();
    signal.fire();
    signal.on(() => calls.push('late'));
    assert.deepEqual(calls, ['early', 'late']);
    assert.equal(signal.hasFired(), true);
  });

  test('an unsubscribed listener is not called', () => {
    const signal = createOnceSignal();
    let called = false;
    const off = signal.on(() => { called = true; });
    off();
    signal.fire();
    assert.equal(called, false);
  });
});
