// The keyboard padding helper (utils/keyboardInset.ts): Android adds the keyboard's height, iOS adds nothing
// (KeyboardAvoidingView already lifts the screen there), and bad values never produce a negative or NaN padding.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {REVEAL_BOTTOM_MARGIN, REVEAL_TOP_MARGIN, keyboardPadding, revealScrollY} from '../utils/keyboardInset.ts';

describe('revealScrollY', () => {
  // An Itel-sized form: a 700-high scroll view, a 280 keyboard over its bottom (content padding layout)
  const base = {fieldHeight: 54, scrollY: 0, viewportHeight: 700, covered: 280};

  test('a field already visible above the keyboard: no scroll', () => {
    assert.equal(revealScrollY({...base, fieldTop: 100}), null);
    // its bottom plus the error-line margin just fits: 700 - 280 = 420 visible
    assert.equal(revealScrollY({...base, fieldTop: 420 - 54 - REVEAL_BOTTOM_MARGIN}), null);
  });

  test('a field under the keyboard (e.g. confirm password on sign-up): scrolled just enough, error line included', () => {
    const fieldTop = 600;
    const y = revealScrollY({...base, fieldTop});
    assert.equal(y, fieldTop + 54 + REVEAL_BOTTOM_MARGIN - 420);
    assert.ok(fieldTop + 54 + REVEAL_BOTTOM_MARGIN <= y! + 420, 'its bottom and error line end up visible');
  });

  test('a field scrolled off the top: brought back with room for its label', () => {
    assert.equal(revealScrollY({...base, fieldTop: 100, scrollY: 300}), 100 - REVEAL_TOP_MARGIN);
    assert.equal(revealScrollY({...base, fieldTop: 10, scrollY: 300}), 0, 'never above the content');
  });

  test('spacer layout: the scroll view is already short, nothing more is covered', () => {
    assert.equal(revealScrollY({fieldTop: 150, fieldHeight: 54, scrollY: 0, viewportHeight: 300, covered: 0}), null);
    assert.equal(revealScrollY({fieldTop: 250, fieldHeight: 54, scrollY: 0, viewportHeight: 300, covered: 0}), 250 + 54 + REVEAL_BOTTOM_MARGIN - 300);
  });

  test('a field taller than the visible part (the reflection text box): aligned by its top', () => {
    assert.equal(revealScrollY({fieldTop: 500, fieldHeight: 400, scrollY: 0, viewportHeight: 700, covered: 280}), 500 - REVEAL_TOP_MARGIN);
  });

  test('no room at all, or bad numbers', () => {
    assert.equal(revealScrollY({...base, fieldTop: 600, covered: 800}), 600 - REVEAL_TOP_MARGIN);
    assert.equal(revealScrollY({...base, fieldTop: NaN}), null);
  });
});

describe('keyboardPadding', () => {
  test('Android: the keyboard height above the navigation bar, rounded', () => {
    assert.equal(keyboardPadding('android', 280), 280);
    assert.equal(keyboardPadding('android', 291.43), 291);
  });

  test('iOS and others: nothing, so the screen is never lifted twice', () => {
    assert.equal(keyboardPadding('ios', 300), 0);
    assert.equal(keyboardPadding('web', 300), 0);
  });

  test('closed, missing or bad heights give 0', () => {
    for (const bad of [0, -12, NaN, Infinity, undefined, null, '280']) assert.equal(keyboardPadding('android', bad), 0, String(bad));
  });
});
