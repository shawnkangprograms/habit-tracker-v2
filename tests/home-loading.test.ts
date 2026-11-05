// Home at launch, before its data is known (utils/homeLoading.ts): nothing untrue, nothing that jumps, and
// exactly the old output once data is known.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const h = await import('../utils/homeLoading.ts');
const {packProgress, NOTHING_TODAY} = await import('../utils/packs/copy.ts');

describe('pack status line', () => {
  test('unknown habits: always blank, never "Nothing scheduled today", "No habits yet" or "0 of 0"', () => {
    for (let total = 0; total <= 6; total++) {
      for (let done = 0; done <= total; done++) {
        for (const hasHabits of [true, false]) {
          const text = h.packStatusText({known: false, done, total, hasHabits});
          assert.equal(text, ' ');
          assert.equal(text.trim(), '', 'no words');
        }
      }
    }
    const unknownFirstFrame = h.packStatusText({known: false, done: 0, total: 0, hasHabits: true});
    assert.notEqual(unknownFirstFrame, NOTHING_TODAY);
    assert.doesNotMatch(unknownFirstFrame, /0 of 0|Nothing|No habits/);
  });

  test('known habits: exactly what Home showed before this fix', () => {
    for (let total = 0; total <= 6; total++) {
      for (let done = 0; done <= total; done++) {
        for (const hasHabits of [true, false]) {
          assert.equal(h.packStatusText({known: true, done, total, hasHabits}), packProgress(done, total, hasHabits));
        }
      }
    }
    assert.equal(h.packStatusText({known: true, done: 0, total: 0, hasHabits: true}), NOTHING_TODAY);// true once known
  });
});

describe('stats card slot', () => {
  test('placeholder from the first frame until a stats load has finished', () => {
    assert.equal(h.statsSlot({statsSettled: false, hasStats: false}), 'placeholder');
  });

  test('the real card once stats are known', () => {
    assert.equal(h.statsSlot({statsSettled: true, hasStats: true}), 'card');
    assert.equal(h.statsSlot({statsSettled: false, hasStats: true}), 'card');
  });

  test('a failed load removes the placeholder: the card stays hidden, as before', () => {
    assert.equal(h.statsSlot({statsSettled: true, hasStats: false}), 'none');
  });
});

describe('add controls', () => {
  test('"Create a habit pack", "Habits" and "Add a habit" wait until habits are known', () => {
    assert.equal(h.showAddControls({loaded: false}), false);
    assert.equal(h.showAddControls({loaded: true}), true);
  });
});

describe('placeholder rows', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  test('one per saved habit id, no cap, while habits are unknown and the card is expanded', () => {
    assert.equal(h.placeholderRows({known: false, expanded: true, habitIds: ids}), 5);
    assert.equal(h.placeholderRows({known: false, expanded: true, habitIds: []}), 0);
  });

  test('none when collapsed, and none once habits are known', () => {
    assert.equal(h.placeholderRows({known: false, expanded: false, habitIds: ids}), 0);
    assert.equal(h.placeholderRows({known: true, expanded: true, habitIds: ids}), 0);
  });
});
