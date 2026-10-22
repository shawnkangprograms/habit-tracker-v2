// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const v = await import('../validation/validators.ts');
const f = await import('../utils/reminderForm.ts');

const base = {habitName: 'Read', icon: 'book', frequency: {type: 'daily'}, reminderTime: '07:30'};

describe('alarm and lead validators', () => {
  test('alarm: missing is off; strict boolean otherwise', () => {
    assert.deepEqual(v.validateAlarm(undefined), {valid: true, value: false});
    assert.deepEqual(v.validateAlarm(true), {valid: true, value: true});
    assert.deepEqual(v.validateAlarm(false), {valid: true, value: false});
    for (const bad of [1, 0, 'true', null]) assert.equal(v.validateAlarm(bad).valid, false, String(bad));
  });

  test('lead: missing is 0; only 0, 5, 10, 15, 30, 60', () => {
    assert.deepEqual(v.validateRemindBeforeMin(undefined), {valid: true, value: 0});
    for (const ok of [0, 5, 10, 15, 30, 60]) assert.deepEqual(v.validateRemindBeforeMin(ok), {valid: true, value: ok});
    for (const bad of [7, -5, 45, 120, 5.5, '15', null, NaN]) {
      assert.equal(v.validateRemindBeforeMin(bad).valid, false, String(bad));
    }
  });

  test('habit input: defaults when missing, values kept when valid, first error when invalid', () => {
    const plain = v.validateHabitInput(base);
    assert.ok(plain.valid);
    assert.equal(plain.value.alarm, false);
    assert.equal(plain.value.remindBeforeMin, 0);

    const set = v.validateHabitInput({...base, alarm: true, remindBeforeMin: 15});
    assert.ok(set.valid);
    assert.equal(set.value.alarm, true);
    assert.equal(set.value.remindBeforeMin, 15);

    assert.equal(v.validateHabitInput({...base, remindBeforeMin: 20}).valid, false);
    assert.equal(v.validateHabitInput({...base, alarm: 'yes'}).valid, false);
  });
});

describe('reminder form helpers', () => {
  test('HH:MM <-> picker Date, on the local clock; an invalid time shows 09:00', () => {
    assert.equal(f.dateToTime(f.timeToDate('07:05')), '07:05');
    assert.equal(f.dateToTime(f.timeToDate('23:59')), '23:59');
    assert.equal(f.dateToTime(f.timeToDate('00:00')), '00:00');
    assert.equal(f.dateToTime(f.timeToDate('')), '09:00');
    assert.equal(f.dateToTime(new Date(2026, 9, 22, 6, 7)), '06:07');
  });

  // 2026-10-22 is a Thursday
  const now = new Date(2026, 9, 22, 16, 50);
  const daily = {type: 'daily'} as const;

  const note = (reminderTime: string | null, remindBeforeMin: number, frequency: Parameters<typeof f.reminderTimingNote>[0]['frequency'] = daily) =>
    f.reminderTimingNote({reminderTime, remindBeforeMin, frequency, now});

  test('due time passed: "Starts from tomorrow.", for lead 0 and with a lead', () => {
    assert.equal(note('16:45', 0), 'startsTomorrow');
    assert.equal(note('16:50', 0), 'startsTomorrow');// exactly now: the due one is not sent any more
    assert.equal(note('16:45', 30), 'startsTomorrow');
    assert.equal(f.timingNoteText('startsTomorrow', '16:45'), 'Starts from tomorrow.');
  });

  test('only the heads-up passed: the due-time reminder still comes today', () => {
    assert.equal(note('17:00', 15), 'headsUpPassed');// heads-up 16:45
    assert.equal(note('17:00', 10), 'headsUpPassed');// heads-up exactly now
    assert.equal(f.timingNoteText('headsUpPassed', '17:00'),
      "Today's heads-up has passed. The reminder at 17:00 still comes today.");
  });

  test('nothing passed yet, lead 0 still ahead, not due today, or no time: no line', () => {
    assert.equal(note('17:00', 5), null);// heads-up 16:55
    assert.equal(note('17:00', 0), null);
    assert.equal(note('08:00', 0, {type: 'weekdays', days: ['fri']}), null);
    assert.equal(note('08:00', 0, {type: 'weekdays', days: ['thu']}), 'startsTomorrow');
    assert.equal(note(null, 30), null);
    assert.equal(f.timingNoteText(null, '17:00'), null);
  });
});
