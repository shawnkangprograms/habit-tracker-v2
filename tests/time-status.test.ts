// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const t = await import('../utils/timeStatus.ts');

// Local times built with the local Date constructor, so the tests pass in any time zone
const at = (day: number, hour: number, minute = 0, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();
const TODAY = '2026-10-22';

describe('reminder time status', () => {
  test('no reminder time (or an invalid one): none', () => {
    assert.equal(t.reminderTimeStatus(null, null, at(22, 12), TODAY), 'none');
    assert.equal(t.reminderTimeStatus('', null, at(22, 12), TODAY), 'none');
    assert.equal(t.reminderTimeStatus('25:00', null, at(22, 12), TODAY), 'none');
  });

  test('not yet due: pending', () => {
    assert.equal(t.reminderTimeStatus('16:45', null, at(22, 16, 44, 59), TODAY), 'pending');
  });

  test('due now exactly: still pending through the due minute, overdue from the next minute', () => {
    assert.equal(t.reminderTimeStatus('16:45', null, at(22, 16, 45, 0), TODAY), 'pending');
    assert.equal(t.reminderTimeStatus('16:45', null, at(22, 16, 45, 59), TODAY), 'pending');
    assert.equal(t.reminderTimeStatus('16:45', null, at(22, 16, 46, 0), TODAY), 'overdue');
  });

  test('completed 1 minute before, exactly at, and 1 minute after the time', () => {
    const later = at(22, 20);
    assert.equal(t.reminderTimeStatus('16:45', at(22, 16, 44), later, TODAY), 'onTime');
    assert.equal(t.reminderTimeStatus('16:45', at(22, 16, 45), later, TODAY), 'onTime');
    assert.equal(t.reminderTimeStatus('16:45', at(22, 16, 45, 59), later, TODAY), 'onTime');
    assert.equal(t.reminderTimeStatus('16:45', at(22, 16, 46), later, TODAY), 'late');
  });

  test('never completed, after the time: overdue', () => {
    assert.equal(t.reminderTimeStatus('08:00', null, at(22, 23, 59), TODAY), 'overdue');
  });

  test('midnight rollover: yesterday\'s completion never counts today', () => {
    // ticked yesterday at 08:00; today's 08:00 habit is not done
    assert.equal(t.reminderTimeStatus('08:00', at(21, 7, 30), at(22, 7, 0), TODAY), 'pending');
    assert.equal(t.reminderTimeStatus('08:00', at(21, 7, 30), at(22, 9, 0), TODAY), 'overdue');
  });

  test('a stale list (now is already the next day) shows no status', () => {
    assert.equal(t.reminderTimeStatus('20:00', null, at(23, 0, 1), TODAY), 'none');
  });

  test('a system row (completedAt 0) is not a completion', () => {
    assert.equal(t.reminderTimeStatus('08:00', 0, at(22, 9), TODAY), 'overdue');
  });
});

describe('row time status (Home)', () => {
  const row = (completed: number, completedAt: number) => ({reminderTime: '08:00', completed, completedAt});

  test('checked with a usable time: onTime or late', () => {
    assert.equal(t.rowTimeStatus(row(1, at(22, 7, 59)), at(22, 12), TODAY), 'onTime');
    assert.equal(t.rowTimeStatus(row(1, at(22, 9)), at(22, 12), TODAY), 'late');
  });

  test('checked but the time is unknown (system row, other date): none, never overdue', () => {
    assert.equal(t.rowTimeStatus(row(1, 0), at(22, 12), TODAY), 'none');
    assert.equal(t.rowTimeStatus(row(1, at(21, 7)), at(22, 12), TODAY), 'none');
  });

  test('unchecked again after a tick: the old tick time is ignored', () => {
    assert.equal(t.rowTimeStatus(row(0, at(22, 7)), at(22, 12), TODAY), 'overdue');
  });
});

describe('next status change (the single timeout)', () => {
  const rows = [
    {reminderTime: '09:00', completed: 0, completedAt: 0},
    {reminderTime: '07:00', completed: 1, completedAt: at(22, 6)},// checked: never changes on its own
    {reminderTime: '12:30', completed: 0, completedAt: 0},
    {reminderTime: null, completed: 0, completedAt: 0},
  ];

  test('the earliest due minute end still ahead among unchecked timed rows', () => {
    assert.equal(t.nextStatusChangeAt(rows, at(22, 6), TODAY), at(22, 9, 1));
    assert.equal(t.nextStatusChangeAt(rows, at(22, 9, 1), TODAY), at(22, 12, 31));
  });

  test('no loop: the target is always later, and a day of firings is one per due time plus midnight', () => {
    // Home's timeout chain: fire 50 ms past the target, recompute from that moment
    let clock = at(22, 0, 0, 1);
    const firings: number[] = [];
    while (firings.length < 100) {
      const target = t.nextStatusChangeAt(rows, clock, TODAY);
      assert.ok(target > clock);
      clock = target + 50;
      firings.push(target);
      if (target >= at(23, 0)) break;
    }
    assert.deepEqual(firings, [at(22, 9, 1), at(22, 12, 31), at(23, 0)]);
  });

  test('an edit after the time has passed: with the fresh clock the row is overdue at once', () => {
    // Home open since 09:00; at 17:00 the time is changed to 16:00 and the load refreshes `now`
    assert.equal(t.reminderTimeStatus('16:00', null, at(22, 17), TODAY), 'overdue');
    assert.equal(t.reminderTimeStatus('16:00', null, at(22, 9), TODAY), 'pending');// the stale clock's answer
  });

  test('nothing left today: the next local midnight', () => {
    assert.equal(t.nextStatusChangeAt(rows, at(22, 13), TODAY), at(23, 0));
    assert.equal(t.nextStatusChangeAt([], at(22, 13), TODAY), at(23, 0));
  });
});
