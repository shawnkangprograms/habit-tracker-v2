// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {homeEmptyState} from '../utils/homeEmptyState.ts';

const base = {habitCount: 0, loading: false, firstPullDone: false, waitOver: false};

describe('home empty state', () => {
  test('hidden while Home is still loading, whatever the other flags say', () => {
    assert.equal(homeEmptyState({...base, loading: true}), 'hidden');
    assert.equal(homeEmptyState({...base, loading: true, firstPullDone: true, waitOver: true}), 'hidden');
  });

  test('hidden when habits exist, also before the first pull is done', () => {
    assert.equal(homeEmptyState({...base, habitCount: 1}), 'hidden');
    assert.equal(homeEmptyState({...base, habitCount: 3, firstPullDone: true}), 'hidden');
  });

  test('checking while the first pull is pending and the wait is not over', () => {
    assert.equal(homeEmptyState(base), 'checking');
  });

  test('empty once the first pull is done (a new user, or one who deleted every habit)', () => {
    assert.equal(homeEmptyState({...base, firstPullDone: true}), 'empty');
  });

  test('empty after the timeout or an offline sync result, so a new offline user is never stuck', () => {
    assert.equal(homeEmptyState({...base, waitOver: true}), 'empty');
  });
});
