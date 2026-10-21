// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const {daysToGoLabel, medalStates, streakIconLabel, MEDAL_TIERS} = await import('../utils/medals.ts');
const {earnedBadges, STREAK_MILESTONES} = await import('../utils/gamification.ts');

describe('medal states', () => {
  test('new user: all six locked, the first is 3 days to go', () => {
    const medals = medalStates(0);
    assert.equal(medals.length, 6);
    assert.ok(medals.every((m) => !m.earned));
    assert.deepEqual(medals.map((m) => m.daysToGo), [3, 7, 14, 30, 60, 100]);
    assert.equal(daysToGoLabel(medals[0].daysToGo), '3 days to go');
  });

  test('longest 7: bronze and silver earned, the rest count down from 7', () => {
    const medals = medalStates(7);
    assert.deepEqual(medals.map((m) => m.earned), [true, true, false, false, false, false]);
    assert.deepEqual(medals.map((m) => m.daysToGo), [0, 0, 7, 23, 53, 93]);
  });

  test('longest 150: everything earned, nothing to go', () => {
    const medals = medalStates(150);
    assert.ok(medals.every((m) => m.earned && m.daysToGo === 0));
  });

  test('earned always matches the engine (earnedBadges) for 0..120', () => {
    for (let longest = 0; longest <= 120; longest++) {
      const earned = medalStates(longest).filter((m) => m.earned).map((m) => m.days);
      assert.deepEqual(earned, earnedBadges(longest), `longest ${longest}`);
    }
  });

  test('tiers follow the milestones in order, bronze to blaze', () => {
    assert.deepEqual(medalStates(0).map((m) => m.days), STREAK_MILESTONES.map((m) => m.days));
    assert.deepEqual(medalStates(0).map((m) => m.tier), ['bronze', 'silver', 'gold', 'emerald', 'ruby', 'blaze']);
    assert.equal(MEDAL_TIERS.length, STREAK_MILESTONES.length);
  });

  test('bad input is treated as no streak', () => {
    assert.deepEqual(medalStates(-5), medalStates(0));
    assert.deepEqual(medalStates(Number.NaN), medalStates(0));
  });

  test('labels: singular day, plural days', () => {
    assert.equal(daysToGoLabel(1), '1 day to go');
    assert.equal(daysToGoLabel(4), '4 days to go');
  });
});

describe('tab icon label', () => {
  test('the streak as is up to 999, then 999+', () => {
    assert.equal(streakIconLabel(0), '0');
    assert.equal(streakIconLabel(42), '42');
    assert.equal(streakIconLabel(999), '999');
    assert.equal(streakIconLabel(1000), '999+');
    assert.equal(streakIconLabel(12345), '999+');
  });
});
