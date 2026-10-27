// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, mock, test} from 'node:test';
import assert from 'node:assert/strict';
import {decideRebuild, stillCurrent, type SchedulerAuth} from '../services/notificationGate.ts';
import {createOnceSignal, startAfter} from '../services/startupSignals.ts';

const signedIn: SchedulerAuth = {kind: 'signedIn', uid: 'u1'};
const bothOn = {remindersOn: true, nudgeOn: true};

describe('decideRebuild', () => {
  test('auth not known yet: skip, never cancel everything', () => {
    assert.equal(decideRebuild({auth: {kind: 'unknown'}, prefs: bothOn, permission: 'granted'}), 'skip');
    assert.equal(decideRebuild({auth: {kind: 'unknown'}, prefs: null, permission: null}), 'skip');
  });

  test('signed out: cancel all', () => {
    assert.equal(decideRebuild({auth: {kind: 'signedOut'}, prefs: null, permission: null}), 'cancelAll');
  });

  test('signed in with both switches off: cancel all, whatever the permission', () => {
    const off = {remindersOn: false, nudgeOn: false};
    assert.equal(decideRebuild({auth: signedIn, prefs: off, permission: null}), 'cancelAll');
    assert.equal(decideRebuild({auth: signedIn, prefs: off, permission: 'granted'}), 'cancelAll');
  });

  test('signed in without permission (or not asked, or prefs missing): skip', () => {
    for (const permission of ['denied', 'undetermined', 'unavailable', null] as const) {
      assert.equal(decideRebuild({auth: signedIn, prefs: bothOn, permission}), 'skip');
    }
    assert.equal(decideRebuild({auth: signedIn, prefs: null, permission: 'granted'}), 'skip');
  });

  test('signed in, a switch on, permission granted: build', () => {
    assert.equal(decideRebuild({auth: signedIn, prefs: {remindersOn: false, nudgeOn: true}, permission: 'granted'}), 'build');
    assert.equal(decideRebuild({auth: signedIn, prefs: bothOn, permission: 'granted'}), 'build');
  });

  test('stillCurrent: only the same signed-in user', () => {
    assert.equal(stillCurrent('u1', signedIn), true);
    assert.equal(stillCurrent('u1', {kind: 'signedIn', uid: 'u2'}), false);
    assert.equal(stillCurrent('u1', {kind: 'signedOut'}), false);
    assert.equal(stillCurrent('u1', {kind: 'unknown'}), false);
  });
});

describe('startAfter', () => {
  const opts = {afterMs: 3000, fallbackMs: 8000};

  test('starts afterMs after the signal, not at the fallback too', () => {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      const signal = createOnceSignal();
      let starts = 0;
      startAfter(signal, () => { starts++; }, opts);
      mock.timers.tick(1000);
      signal.fire();
      mock.timers.tick(2999);
      assert.equal(starts, 0);
      mock.timers.tick(1);
      assert.equal(starts, 1);
      mock.timers.tick(10000);
      assert.equal(starts, 1);
    } finally {
      mock.timers.reset();
    }
  });

  test('starts at the fallback if the signal never fires', () => {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      let starts = 0;
      startAfter(createOnceSignal(), () => { starts++; }, opts);
      mock.timers.tick(7999);
      assert.equal(starts, 0);
      mock.timers.tick(1);
      assert.equal(starts, 1);
    } finally {
      mock.timers.reset();
    }
  });

  test('a signal that already fired: afterMs from now', () => {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      const signal = createOnceSignal();
      signal.fire();
      let starts = 0;
      startAfter(signal, () => { starts++; }, opts);
      mock.timers.tick(3000);
      assert.equal(starts, 1);
    } finally {
      mock.timers.reset();
    }
  });

  test('cleanup before the start cancels it; cleanup after calls the stop function', () => {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      const signal = createOnceSignal();
      let starts = 0;
      let stops = 0;
      const start = () => { starts++; return () => { stops++; }; };

      const cancel = startAfter(signal, start, opts);
      cancel();
      signal.fire();
      mock.timers.tick(10000);
      assert.equal(starts, 0);

      const cleanup = startAfter(signal, start, opts);
      mock.timers.tick(3000);
      assert.equal(starts, 1);
      cleanup();
      cleanup();
      assert.equal(stops, 1);
    } finally {
      mock.timers.reset();
    }
  });
});
