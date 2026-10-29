// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import type {SummaryDay, HabitRate} from '../utils/summary.ts';
import {barCaption, barValue, dayLabel, habitDetail, habitLabel, NO_RATE, rateText, shareStep} from '../utils/summaryLabels.ts';

const day = (over: Partial<SummaryDay>): SummaryDay => ({
  date: '2026-10-26', weekday: 'mon', isToday: false, scheduled: 4, done: 3, share: 0.75, perfect: false, ...over,
});

const rate = (over: Partial<HabitRate>): HabitRate => ({
  habitId: 'a', habitName: 'Read', icon: 'book', done: 4, scheduled: 5, rate: 0.8, best: false, ...over,
});

describe('rate text', () => {
  test('no counted day shows a dash, never 0% or NaN', () => {
    assert.equal(rateText(null), NO_RATE);
    assert.equal(rateText(Number.NaN), NO_RATE);
    assert.equal(rateText(0), '0%');
  });

  test('rounded to the nearest percent, but 100% only when everything was done', () => {
    assert.equal(rateText(2 / 3), '67%');
    assert.equal(rateText(7 / 9), '78%');
    assert.equal(rateText(199 / 200), '99%', 'would round to 100');
    assert.equal(rateText(1), '100%');
  });
});

describe('colour steps', () => {
  test('nothing scheduled, none done, thirds, all done', () => {
    assert.equal(shareStep({scheduled: 0, done: 0}), 'none');
    assert.equal(shareStep({scheduled: 4, done: 0}), 0);
    assert.equal(shareStep({scheduled: 4, done: 1}), 1);
    assert.equal(shareStep({scheduled: 3, done: 1}), 2, 'exactly a third is the second step');
    assert.equal(shareStep({scheduled: 4, done: 2}), 2);
    assert.equal(shareStep({scheduled: 3, done: 2}), 3, 'exactly two thirds is the third step');
    assert.equal(shareStep({scheduled: 4, done: 3}), 3);
    assert.equal(shareStep({scheduled: 4, done: 4}), 4);
  });
});

describe('day labels', () => {
  test('words for screen readers', () => {
    assert.equal(dayLabel(day({})), 'Monday: 3 of 4 habits done');
    assert.equal(dayLabel(day({scheduled: 0, done: 0, share: null})), 'Monday: no habits scheduled');
    assert.equal(dayLabel(day({done: 4, share: 1, perfect: true}), true), 'Monday, October 26: 4 of 4 habits done, a perfect day');
    assert.equal(dayLabel(day({isToday: true, scheduled: 1, done: 0, share: 0})), 'Today, so far: 0 of 1 habit done');
  });

  test('bar captions and values', () => {
    assert.equal(barCaption(day({})), 'Mon');
    assert.equal(barCaption(day({isToday: true})), 'Today');
    assert.equal(barValue(day({})), '3/4');
    assert.equal(barValue(day({isToday: true, scheduled: 1, done: 0})), '0/1');
    assert.equal(barValue(day({scheduled: 0, done: 0})), NO_RATE);
  });
});

describe('habit labels', () => {
  test('rate, best marker and not scheduled yet', () => {
    assert.equal(habitLabel(rate({})), 'Read: 4 of 5 days done, 80%');
    assert.equal(habitLabel(rate({best: true})), 'Read: 4 of 5 days done, 80%. Best this range');
    assert.equal(habitLabel(rate({done: 0, scheduled: 0, rate: null})), 'Read: not scheduled yet');
    assert.equal(habitDetail(rate({done: 1, scheduled: 1, rate: 1})), '1 of 1 day');
  });
});
