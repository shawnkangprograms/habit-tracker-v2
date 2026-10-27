// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_PULL_CAP_MS, FIRST_PULL_WAIT_MS, firstPullDeadline, initialFirstPull, nextFirstPull, type FirstPullStatus,
} from '../utils/firstPull.ts';
import {homeEmptyState, type HomeEmptyState} from '../utils/homeEmptyState.ts';

const off: FirstPullStatus = {state: 'off', initialPullDone: false};
const idle: FirstPullStatus = {state: 'idle', initialPullDone: false};
const syncing: FirstPullStatus = {state: 'syncing', initialPullDone: false};
const pulled: FirstPullStatus = {state: 'idle', initialPullDone: true};
const offline: FirstPullStatus = {state: 'offline', initialPullDone: false};

// Home mounts at t=0 with no local habits (a new phone or a reinstall) and sees `atMount`; sync's statuses then
// arrive at the given times. What does Home show at time `at`? The deadline counts as the hook's timer firing.
function shownAt(atMount: FirstPullStatus, events: [number, FirstPullStatus][], at: number, habitCount = 0): HomeEmptyState {
  let state = initialFirstPull(atMount, 0);
  for (const [t, s] of events) {
    if (t <= at) state = nextFirstPull(state, s, t);
  }
  const waitOver = state.waitOver || at >= firstPullDeadline(state, 0);
  return homeEmptyState({habitCount, loading: false, firstPullDone: state.firstPullDone, waitOver});
}

describe('first-pull wait with sync starting after Home is usable', () => {
  test('sync starts late: the 15 s count from its start, not from the mount', () => {
    const events: [number, FirstPullStatus][] = [[4000, idle], [4000, syncing]];// usable + Firestore load = 4 s
    assert.equal(shownAt(off, events, FIRST_PULL_WAIT_MS), 'checking');// the old timer would have ended here
    assert.equal(shownAt(off, events, 4000 + FIRST_PULL_WAIT_MS - 1), 'checking');
    assert.equal(shownAt(off, events, 4000 + FIRST_PULL_WAIT_MS), 'empty');
  });

  test('sync never starts: the 30 s cap from the mount ends the wait', () => {
    assert.equal(shownAt(off, [], FIRST_PULL_CAP_MS - 1), 'checking');
    assert.equal(shownAt(off, [], FIRST_PULL_CAP_MS), 'empty');
  });

  test('sync starts very late: the cap still wins over start + 15 s', () => {
    const state = nextFirstPull(initialFirstPull(off, 0), idle, 25000);
    assert.equal(firstPullDeadline(state, 0), FIRST_PULL_CAP_MS);
  });

  test('sync already running at mount: 15 s from the mount', () => {
    assert.equal(firstPullDeadline(initialFirstPull(syncing, 1000), 1000), 1000 + FIRST_PULL_WAIT_MS);
  });

  test('offline first cycle: the wait ends when it ends, without waiting for the timer', () => {
    const events: [number, FirstPullStatus][] = [[3000, idle], [3000, syncing], [8000, offline]];
    assert.equal(shownAt(off, events, 7999), 'checking');
    assert.equal(shownAt(off, events, 8000), 'empty');
  });

  test('a cycle that ends idle without finishing the pull (an error) ends the wait', () => {
    assert.equal(shownAt(off, [[3000, idle], [3000, syncing], [6000, idle]], 6000), 'empty');
  });

  test('restore on a new phone: "checking" until the pull is done, never "no habits" before it', () => {
    const events: [number, FirstPullStatus][] = [[3000, idle], [3000, syncing], [5000, syncing], [12000, pulled]];
    for (const at of [0, 3000, 5000, 11999]) assert.equal(shownAt(off, events, at), 'checking');
    assert.equal(shownAt(off, events, 12000), 'empty');// pull done and nothing came back: a real "no habits"
    assert.equal(shownAt(off, events, 12000, 3), 'hidden');// the restored habits show instead
  });

  test('this user already pulled before (saved per uid): known as soon as the cursors load', () => {
    assert.equal(shownAt(off, [[3000, idle], [3000, syncing], [3100, {state: 'syncing', initialPullDone: true}]], 3100), 'empty');
  });

  test('the step does not change the timing once sync has started', () => {
    const started = nextFirstPull(initialFirstPull(off, 0), idle, 4000);
    assert.equal(nextFirstPull(started, syncing, 9000).syncStartedAt, 4000);
    assert.equal(nextFirstPull(initialFirstPull(off, 0), off, 4000).syncStartedAt, null);
  });
});
