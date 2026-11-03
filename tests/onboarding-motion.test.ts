// Onboarding motion rules and timings (utils/onboarding/motion.ts), from the approved stage 4 plan.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const m = await import('../utils/onboarding/motion.ts');

describe('step direction', () => {
  test('forward, back, unchanged, and first mount', () => {
    assert.equal(m.stepDirection(2, 3), 'forward');
    assert.equal(m.stepDirection(3, 2), 'back');
    assert.equal(m.stepDirection(0, 0), null);// Back on step 1 does nothing, so nothing moves
    assert.equal(m.stepDirection(null, 0), null);// the first step never animates in
  });

  test('forward comes in from the right, back from the left, 16 px', () => {
    assert.equal(m.enterOffsetX('forward'), 16);
    assert.equal(m.enterOffsetX('back'), -16);
  });
});

describe('staggers', () => {
  test('increase by the step and stop at the cap', () => {
    assert.deepEqual([0, 1, 2, 3].map((i) => m.staggerDelay(i, 60)), [0, 60, 120, 180]);
    assert.equal(m.staggerDelay(50, 60), m.STAGGER_CAP_MS);
    assert.equal(m.staggerDelay(-1, 60), 0);
  });

  test('the last item of any list starts within 400 ms', () => {
    for (const step of [m.TOLD_US_STAGGER_MS, m.ROUTINE_STAGGER_MS]) {
      for (let count = 1; count <= 10; count++) assert.ok(m.staggerDelay(count - 1, step) < 400, `${step} x ${count}`);
    }
  });

  test('What you told us (6 items) ends at 300 ms; the routine (at most 5 cards) at 280 ms', () => {
    assert.equal(m.staggerDelay(5, m.TOLD_US_STAGGER_MS), 300);
    assert.equal(m.staggerDelay(4, m.ROUTINE_STAGGER_MS), 280);
  });
});

describe('durations', () => {
  test('every animation in the plan table runs 80 to 400 ms', () => {
    const durations = {
      STEP_ENTER_MS: m.STEP_ENTER_MS, PROGRESS_MS: m.PROGRESS_MS, OPTION_PRESS_IN_MS: m.OPTION_PRESS_IN_MS,
      OPTION_PRESS_OUT_MS: m.OPTION_PRESS_OUT_MS, SELECT_FADE_MS: m.SELECT_FADE_MS, MARK_POP_MS: m.MARK_POP_MS,
      THUMB_HOLD_MS: m.THUMB_HOLD_MS, THUMB_GLIDE_MS: m.THUMB_GLIDE_MS, NUMBER_BUMP_UP_MS: m.NUMBER_BUMP_UP_MS,
      NUMBER_BUMP_DOWN_MS: m.NUMBER_BUMP_DOWN_MS, BUTTON_PRESS_IN_MS: m.BUTTON_PRESS_IN_MS,
      BUTTON_PRESS_OUT_MS: m.BUTTON_PRESS_OUT_MS, ROW_TICK_HALF_MS: m.ROW_TICK_HALF_MS, QUOTE_IN_MS: m.QUOTE_IN_MS,
      QUOTE_OUT_MS: m.QUOTE_OUT_MS, READY_SETTLE_HALF_MS: m.READY_SETTLE_HALF_MS, RADAR_BASELINE_MS: m.RADAR_BASELINE_MS,
      RADAR_DATA_MS: m.RADAR_DATA_MS, RADAR_LABELS_MS: m.RADAR_LABELS_MS, ITEM_ENTER_MS: m.ITEM_ENTER_MS,
      CHECK_POP_HALF_MS: m.CHECK_POP_HALF_MS, ADDED_OUT_MS: m.ADDED_OUT_MS, ADDED_IN_MS: m.ADDED_IN_MS,
    };
    for (const [name, ms] of Object.entries(durations)) assert.ok(ms >= 80 && ms <= 400, `${name} = ${ms}`);
  });

  test('the answer rows press down 3 px; buttons scale to 0.97', () => {
    assert.equal(m.OPTION_PRESS_DEPTH_PX, 3);
    assert.equal(m.BUTTON_PRESS_SCALE, 0.97);
  });

  test('the radar: baseline first, then the scores, then the labels once the scores have grown', () => {
    assert.ok(m.RADAR_DATA_DELAY_MS > 0);
    assert.equal(m.RADAR_LABELS_DELAY_MS, m.RADAR_DATA_DELAY_MS + m.RADAR_DATA_MS - 50);
    assert.ok(m.RADAR_DATA_FROM_SCALE > 0 && m.RADAR_DATA_FROM_SCALE < 1);
  });

  test('Building Profile keeps its timing: 2.5 s count, 300 ms hold (the settle fits inside), 0.8 s when reduced', () => {
    assert.equal(m.BUILDING_DURATION_MS, 2500);
    assert.equal(m.BUILDING_TICK_MS, 100);
    assert.equal(m.BUILDING_HOLD_MS, 300);
    assert.equal(m.BUILDING_REDUCED_HOLD_MS, 800);
    assert.equal(m.QUOTE_MS, 2500);
    assert.ok(m.READY_SETTLE_HALF_MS * 2 <= m.BUILDING_HOLD_MS);
  });
});

describe('reduced motion', () => {
  test('one rule: no motion when the setting is on', () => {
    assert.equal(m.shouldAnimate(false), true);
    assert.equal(m.shouldAnimate(true), false);
  });
});
