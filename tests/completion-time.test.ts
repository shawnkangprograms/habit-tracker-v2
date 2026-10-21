// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const t = await import('../utils/completionTime.ts');

// Local times built with the local Date constructor, so the tests pass in any time zone
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const row = (day: number, hour: number, minute = 0) => ({date: date(day), updatedAt: at(day, hour, minute)});

describe('completion time', () => {
  test('local minutes of the day', () => {
    assert.equal(t.localMinutesOfDay(at(20, 0, 0)), 0);
    assert.equal(t.localMinutesOfDay(at(20, 9, 30)), 570);
    assert.equal(t.localMinutesOfDay(at(20, 23, 59)), 1439);
  });

  test('4 samples give no typical time; 5 do', () => {
    const four = [1, 2, 3, 4].map((d) => row(d, 9));
    assert.equal(t.typicalMinutes(t.sameDaySamples(four)), null);
    assert.equal(t.isEarlierThanUsual(at(20, 6), t.sameDaySamples(four)), false);
    const five = [1, 2, 3, 4, 5].map((d) => row(d, 9));
    assert.equal(t.typicalMinutes(t.sameDaySamples(five)), 540);
  });

  test('median: odd count, even count', () => {
    assert.equal(t.typicalMinutes([600, 500, 700, 520, 900]), 600);
    assert.equal(t.typicalMinutes([500, 520, 600, 700, 800, 900]), 650);
  });

  test('threshold: 59 minutes earlier is not early, 60 is', () => {
    const samples = [1, 2, 3, 4, 5].map((d) => row(d, 9)).map((r) => t.localMinutesOfDay(r.updatedAt));
    assert.equal(t.isEarlierThanUsual(at(20, 8, 1), samples), false);// 59 min
    assert.equal(t.isEarlierThanUsual(at(20, 8, 0), samples), true);// 60 min
    assert.equal(t.isEarlierThanUsual(at(20, 10, 0), samples), false);// later than usual
  });

  test('backfilled rows (updatedAt 0) and rows ticked on a later day are ignored', () => {
    const rows = [
      ...[1, 2, 3, 4].map((d) => row(d, 9)),
      {date: date(5), updatedAt: 0},// system row
      {date: date(6), updatedAt: at(7, 1)},// changed the next day
    ];
    assert.deepEqual(t.sameDaySamples(rows).length, 4);
    assert.equal(t.typicalMinutes(t.sameDaySamples(rows)), null);
  });

  test('only the newest 14 same-day ticks count', () => {
    const old = [1, 2, 3, 4, 5, 6].map((d) => row(d, 20));// evenings, older
    const recent = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((d) => row(d, 9));// mornings, newest 14
    const samples = t.sameDaySamples([...old, ...recent]);
    assert.equal(samples.length, 14);
    assert.equal(t.typicalMinutes(samples), 540);
  });
});
