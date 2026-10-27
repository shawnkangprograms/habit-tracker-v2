// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initialFirstPull, nextFirstPull, type FirstPullStatus} from '../utils/firstPull.ts';
import {homeEmptyState} from '../utils/homeEmptyState.ts';

// Home with no local habits (a new phone or a reinstall) while sync's statuses arrive in order.
// Returns the empty state Home would show after each status.
function emptyStatesFor(statuses: FirstPullStatus[]) {
  let state = initialFirstPull(statuses[0]);
  const shown = [homeEmptyState({habitCount: 0, loading: false, ...state})];
  for (const s of statuses.slice(1)) {
    state = nextFirstPull(state, s);
    shown.push(homeEmptyState({habitCount: 0, loading: false, ...state}));
  }
  return shown;
}

const off: FirstPullStatus = {state: 'off', initialPullDone: false};
const idle: FirstPullStatus = {state: 'idle', initialPullDone: false};
const syncing: FirstPullStatus = {state: 'syncing', initialPullDone: false};

describe('first pull with sync starting after Home is usable', () => {
  test('restore on a new phone: "checking" until the pull is done, never "no habits" before it', () => {
    assert.deepEqual(emptyStatesFor([
      off,// Home mounts before sync starts
      idle,// start()
      syncing,
      syncing,// cursors loaded: not done yet
      {state: 'idle', initialPullDone: true},// pulled to the end
    ]), ['checking', 'checking', 'checking', 'checking', 'empty']);
  });

  test('restored habits hide the empty state whatever the pull says', () => {
    const state = nextFirstPull(initialFirstPull(off), syncing);
    assert.equal(homeEmptyState({habitCount: 3, loading: false, ...state}), 'hidden');
  });

  test('offline first cycle: the wait ends, so a new offline user is not stuck', () => {
    assert.deepEqual(emptyStatesFor([off, idle, syncing, {state: 'offline', initialPullDone: false}]),
      ['checking', 'checking', 'checking', 'empty']);
  });

  test('a cycle that ends idle without finishing the pull (an error) ends the wait', () => {
    assert.deepEqual(emptyStatesFor([off, idle, syncing, idle]), ['checking', 'checking', 'checking', 'empty']);
  });

  test('not started yet ("off" only): still checking (the 15 s timer in the hook ends it)', () => {
    assert.deepEqual(emptyStatesFor([off, off, idle]), ['checking', 'checking', 'checking']);
  });

  test('this user already pulled before (saved per uid): known as soon as the cursors load', () => {
    assert.deepEqual(emptyStatesFor([off, idle, syncing, {state: 'syncing', initialPullDone: true}]),
      ['checking', 'checking', 'checking', 'empty']);
  });
});
