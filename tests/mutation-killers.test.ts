// Tests written for the mutants the suite let through in the Phase 1a mutation run (docs/TEST_STRATEGY.md, Part F).
// Each names the mutant it kills. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {HabitRef} from '../utils/packs/membership.ts';
import type {PacksRecord} from '../utils/packs/record.ts';

const m = await import('../utils/packs/membership.ts');
const G = await import('../utils/gamification.ts');

describe('M08: adoption never looks past a same-named habit that is already in another pack', () => {
  test('a packed "Walk" listed first does not hide the unpacked "walk" that should join the new pack', () => {
    const record: PacksRecord = {version: 1, packs: [
      {id: 'custom-1', kind: 'custom', name: 'Mornings', habitIds: ['packed'], dropped: [], createdAt: 1, order: 0},
      {id: 'steady_energy', kind: 'builtin', builtinId: 'steady_energy', name: 'Steady Energy', habitIds: [], dropped: [], createdAt: 1, order: 1},
    ]};
    const habits: HabitRef[] = [
      {habitId: 'packed', habitName: 'Walk for 20 minutes'},
      {habitId: 'free', habitName: 'walk for 20  minutes'},
    ];
    const next = m.adoptExisting(record, 'steady_energy', habits);
    assert.deepEqual(next.packs.map((p) => p.habitIds), [['packed'], ['free']]);
  });
});

describe('M20: isScheduledOn\'s own contract includes "not deleted" (equivalent today: every caller filters first)', () => {
  test('a deleted habit is never scheduled, whatever its schedule and creation date', () => {
    const habit = {habitId: 'h', createdDate: '2026-01-01', frequencyType: 'daily' as const, days: [], deleted: true};
    assert.equal(G.isScheduledOn(habit, '2026-11-09'), false);
    assert.equal(G.isScheduledOn({...habit, deleted: false}, '2026-11-09'), true);
  });
});
