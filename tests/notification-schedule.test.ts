// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {ScheduleHabit, PlannedNotification} from '../utils/notificationSchedule.ts';
import type {NotificationPrefs} from '../utils/notificationPrefs.ts';

const s = await import('../utils/notificationSchedule.ts');
const {DEFAULT_NOTIFICATION_PREFS} = await import('../utils/notificationPrefs.ts');

// 2026-10-21 is a Wednesday (window: Wed 21, Thu 22, Fri 23). Local constructor: any time zone works.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const NOW = at(21, 9, 0);

const daily = (habitId: string, reminderTime: string | null = '18:00', habitName = 'Read'): ScheduleHabit =>
  ({habitId, habitName, frequencyType: 'daily', days: [], reminderTime, alarm: false, remindBeforeMin: 0});
const onDays = (habitId: string, days: ScheduleHabit['days'], reminderTime: string | null = '18:00'): ScheduleHabit =>
  ({habitId, habitName: 'Run', frequencyType: 'weekdays', days, reminderTime, alarm: false, remindBeforeMin: 0});

const prefs = (over: Partial<NotificationPrefs>): NotificationPrefs => ({...DEFAULT_NOTIFICATION_PREFS, ...over});
const REMINDERS = prefs({remindersOn: true});
const NUDGE = prefs({nudgeOn: true});
const none = new Set<string>();

const ids = (list: PlannedNotification[]) => list.map((n) => n.id);
const nudges = (list: PlannedNotification[]) => list.filter((n) => n.kind === 'nudge');

describe('habit reminders', () => {
  test('a daily habit: one reminder per day for 3 days, at its local time, titled with its name', () => {
    const list = s.buildSchedule([daily('h1')], none, REMINDERS, NOW, null);
    assert.deepEqual(ids(list), ['hq:habit:h1:2026-10-21', 'hq:habit:h1:2026-10-22', 'hq:habit:h1:2026-10-23']);
    assert.deepEqual(list.map((n) => n.fireAt), [at(21, 18), at(22, 18), at(23, 18)].map((d) => d.getTime()));
    assert.ok(list.every((n) => n.title === 'Read' && n.kind === 'habit'));
  });

  test('weekday habits only on their scheduled days', () => {
    assert.deepEqual(ids(s.buildSchedule([onDays('h1', ['thu'])], none, REMINDERS, NOW, null)), ['hq:habit:h1:2026-10-22']);
    assert.deepEqual(s.buildSchedule([onDays('h1', ['sat', 'sun'])], none, REMINDERS, NOW, null), []);
  });

  test('done today: today\'s reminder is skipped, the next days stay', () => {
    const list = s.buildSchedule([daily('h1')], new Set(['h1']), REMINDERS, NOW, null);
    assert.deepEqual(ids(list), ['hq:habit:h1:2026-10-22', 'hq:habit:h1:2026-10-23']);
  });

  test('past times today are skipped; habits without a reminder get none', () => {
    const list = s.buildSchedule([daily('early', '08:00'), daily('none', null)], none, REMINDERS, NOW, null);
    assert.deepEqual(ids(list), ['hq:habit:early:2026-10-22', 'hq:habit:early:2026-10-23']);
  });

  test('both switches off: nothing', () => {
    assert.deepEqual(s.buildSchedule([daily('h1')], none, DEFAULT_NOTIFICATION_PREFS, NOW, 5), []);
  });

  test('the window rolls over a month end with local dates', () => {
    const list = s.buildSchedule([daily('h1', '18:00')], none, REMINDERS, at(31, 0, 30), null);
    assert.deepEqual(ids(list), ['hq:habit:h1:2026-10-31', 'hq:habit:h1:2026-11-01', 'hq:habit:h1:2026-11-02']);
    assert.equal(list[2].fireAt, new Date(2026, 10, 2, 18, 0).getTime());
  });

  test('the due-time reminder always comes at the due time, for lead 0, 5 and 60, with the usual copy', () => {
    for (const lead of [0, 5, 60]) {
      const list = s.buildSchedule([{...daily('h1', '18:00'), remindBeforeMin: lead}], none, REMINDERS, NOW, null);
      const dueOnes = list.filter((n) => n.kind === 'habit');
      assert.deepEqual(ids(dueOnes), ['hq:habit:h1:2026-10-21', 'hq:habit:h1:2026-10-22', 'hq:habit:h1:2026-10-23'], `lead ${lead}`);
      assert.deepEqual(dueOnes.map((n) => n.fireAt), [at(21, 18), at(22, 18), at(23, 18)].map((d) => d.getTime()));
      assert.ok(dueOnes.every((n) => n.leadMin === 0 && (s.REMINDER_BODIES as readonly string[]).includes(n.body)));
    }
  });

  test('the early heads-up exists only for lead > 0, at due minus lead, with the lead copy and its own id', () => {
    assert.equal(s.buildSchedule([daily('h1', '18:00')], none, REMINDERS, NOW, null).filter((n) => n.kind === 'early').length, 0);
    const list = s.buildSchedule([{...daily('h1', '18:00'), remindBeforeMin: 10}], none, REMINDERS, NOW, null);
    const early = list.filter((n) => n.kind === 'early');
    assert.deepEqual(ids(early), ['hq:early:h1:2026-10-21', 'hq:early:h1:2026-10-22', 'hq:early:h1:2026-10-23']);
    assert.deepEqual(early.map((n) => n.fireAt), [at(21, 17, 50), at(22, 17, 50), at(23, 17, 50)].map((d) => d.getTime()));
    const wordings: string[] = s.LEAD_BODIES.map((text) => text('10 minutes'));
    assert.ok(early.every((n) => n.leadMin === 10 && wordings.includes(n.body)), 'lead copy');
    assert.equal(list.length, 6, 'one due-time reminder and one heads-up per day');
    assert.equal(s.leadText(60), '1 hour');
  });

  test('early across midnight: 00:10 with 30 min goes to 23:40 the day before, keyed to the due date', () => {
    const list = s.buildSchedule([{...onDays('h1', ['thu'], '00:10'), remindBeforeMin: 30}], none, REMINDERS, NOW, null);
    assert.deepEqual(list.map((n) => [n.id, n.fireAt]), [
      ['hq:early:h1:2026-10-22', at(21, 23, 40).getTime()],
      ['hq:habit:h1:2026-10-22', at(22, 0, 10).getTime()],
    ]);
  });

  test('due the day after the window: only the heads-up is planned if it lands inside the window', () => {
    // window Wed 21..Fri 23; a Saturday 00:10 habit with 30 min: heads-up Fri 23:40 (inside), due Sat (outside)
    const inside = s.buildSchedule([{...onDays('h1', ['sat'], '00:10'), remindBeforeMin: 30}], none, REMINDERS, NOW, null);
    assert.deepEqual(ids(inside), ['hq:early:h1:2026-10-24']);
    assert.equal(inside[0].fireAt, at(23, 23, 40).getTime());
    assert.deepEqual(s.buildSchedule([onDays('h1', ['sat'], '00:10')], none, REMINDERS, NOW, null), []);
  });

  test('a heads-up already past is skipped while the due-time reminder still comes', () => {
    // now 09:00; due 09:20 with 30 min: heads-up 08:50 (past), due 09:20 (ahead)
    const list = s.buildSchedule([{...daily('h1', '09:20'), remindBeforeMin: 30}], none, REMINDERS, NOW, null);
    const today = list.filter((n) => n.id.endsWith('2026-10-21'));
    assert.deepEqual(ids(today), ['hq:habit:h1:2026-10-21']);
    assert.equal(today[0].fireAt, at(21, 9, 20).getTime());
  });

  test('done today skips both for today; later days keep both', () => {
    const list = s.buildSchedule([{...daily('h1', '18:00'), remindBeforeMin: 60}], new Set(['h1']), REMINDERS, NOW, null);
    assert.equal(list.filter((n) => n.id.endsWith('2026-10-21')).length, 0);
    assert.deepEqual(ids(list.filter((n) => n.id.endsWith('2026-10-22'))), ['hq:early:h1:2026-10-22', 'hq:habit:h1:2026-10-22']);
  });

  test('the alarm applies only to the due-time reminder; the heads-up and the nudge are never alarms', () => {
    const list = s.buildSchedule([{...daily('loud', '18:00'), alarm: true, remindBeforeMin: 15}, daily('quiet', '19:00')], none,
      prefs({remindersOn: true, nudgeOn: true}), NOW, null);
    assert.ok(list.filter((n) => n.id.startsWith('hq:habit:loud:')).every((n) => n.alarm));
    assert.ok(list.filter((n) => n.kind === 'early').length === 3);
    assert.ok(list.filter((n) => n.kind === 'early').every((n) => !n.alarm));
    assert.ok(list.filter((n) => n.id.includes(':quiet:')).every((n) => !n.alarm && n.leadMin === 0));
    assert.ok(nudges(list).length > 0 && nudges(list).every((n) => !n.alarm && n.leadMin === 0));
  });

  test('cap of 60 with both kinds: the soonest are kept, whatever their kind', () => {
    // 15 habits x 3 days x (due + heads-up) = 90 candidates
    const habits = Array.from({length: 15}, (_, i) =>
      ({...daily(`h${String(i).padStart(2, '0')}`, `${String(10 + (i % 10)).padStart(2, '0')}:00`), remindBeforeMin: 30}));
    const list = s.buildSchedule(habits, none, REMINDERS, NOW, null);
    assert.equal(list.length, s.MAX_SCHEDULED);
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].fireAt <= list[i].fireAt, 'sorted by time');
    assert.equal(list.filter((n) => n.id.endsWith('2026-10-21')).length, 30, 'all of today, both kinds');
    assert.ok(list.some((n) => n.kind === 'early') && list.some((n) => n.kind === 'habit'));
  });

  test('cap of 60: the soonest are kept, the farthest dropped', () => {
    const habits = Array.from({length: 25}, (_, i) => daily(`h${String(i).padStart(2, '0')}`, `${String(10 + (i % 10)).padStart(2, '0')}:00`));
    const list = s.buildSchedule(habits, none, REMINDERS, NOW, null);// 75 candidates
    assert.equal(list.length, s.MAX_SCHEDULED);
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].fireAt <= list[i].fireAt, 'sorted by time');
    assert.ok(list.every((n) => !n.id.endsWith('2026-10-23') || n.fireAt <= at(23, 13).getTime()), 'only the earliest of day 3 kept');
    assert.equal(list.filter((n) => n.id.endsWith('2026-10-21')).length, 25);
  });
});

describe('evening nudge', () => {
  test('only when something scheduled today is still open; future days when something is scheduled', () => {
    const list = s.buildSchedule([daily('h1'), daily('h2')], new Set(['h1']), NUDGE, NOW, null);
    assert.deepEqual(ids(list), ['hq:nudge:2026-10-21', 'hq:nudge:2026-10-22', 'hq:nudge:2026-10-23']);
    assert.equal(list[0].fireAt, at(21, 20, 30).getTime());
  });

  test('all done today: no nudge today (cancelled by the next rebuild), later days stay', () => {
    const list = s.buildSchedule([daily('h1')], new Set(['h1']), NUDGE, NOW, null);
    assert.deepEqual(ids(list), ['hq:nudge:2026-10-22', 'hq:nudge:2026-10-23']);
  });

  test('nothing scheduled on a day: no nudge that day', () => {
    assert.deepEqual(ids(s.buildSchedule([onDays('h1', ['thu'])], none, NUDGE, NOW, null)), ['hq:nudge:2026-10-22']);
  });

  test('past the nudge time today: none today', () => {
    const list = s.buildSchedule([daily('h1')], none, NUDGE, at(21, 20, 45), null);
    assert.deepEqual(ids(list), ['hq:nudge:2026-10-22', 'hq:nudge:2026-10-23']);
  });

  test('quiet hours: never before 08:00 or after 21:30', () => {
    assert.equal(s.clampNudgeMinutes('06:00'), 8 * 60);
    assert.equal(s.clampNudgeMinutes('23:15'), 21 * 60 + 30);
    assert.equal(s.clampNudgeMinutes('21:00'), 21 * 60);
    assert.equal(s.clampNudgeMinutes('nonsense'), 20 * 60 + 30);
  });

  test('chosen time is used', () => {
    const list = s.buildSchedule([daily('h1')], none, prefs({nudgeOn: true, nudgeTime: '19:00'}), NOW, null);
    assert.equal(list[0].fireAt, at(21, 19).getTime());
  });

  test('streak wording only when nothing is done today and the streak is 3 or more', () => {
    const streakTexts = s.NUDGE_STREAK.map((t) => t(5));
    const noneDone = nudges(s.buildSchedule([daily('h1'), daily('h2')], none, NUDGE, NOW, 5));
    assert.ok(streakTexts.includes(noneDone[0].body), noneDone[0].body);
    assert.ok(noneDone[0].body.includes('5'));

    const short = nudges(s.buildSchedule([daily('h1'), daily('h2')], none, NUDGE, NOW, 2));
    assert.ok((s.NUDGE_DEFAULT as readonly string[]).includes(short[0].body));

    const oneDone = nudges(s.buildSchedule([daily('h1'), daily('h2'), daily('h3')], new Set(['h1']), NUDGE, NOW, 5));
    assert.ok((s.NUDGE_DEFAULT as readonly string[]).includes(oneDone[0].body), 'a habit done today already keeps the streak');
  });

  test('one left: the one-left wording', () => {
    const list = nudges(s.buildSchedule([daily('h1'), daily('h2')], new Set(['h1']), NUDGE, NOW, 5));
    assert.ok((s.NUDGE_ONE_LEFT as readonly string[]).includes(list[0].body));
  });

  test('future days always use the default wording', () => {
    const list = nudges(s.buildSchedule([daily('h1')], none, NUDGE, NOW, 9));
    assert.ok(list.slice(1).every((n) => (s.NUDGE_DEFAULT as readonly string[]).includes(n.body)));
  });

  test('no exclamation marks anywhere', () => {
    const all = [...s.REMINDER_BODIES, ...s.NUDGE_DEFAULT, ...s.NUDGE_ONE_LEFT, ...s.NUDGE_STREAK.map((t) => t(4))];
    assert.ok(all.every((t) => !t.includes('!')));
  });
});

describe('wording rotation', () => {
  test('consecutive notifications never share a body', () => {
    const habits = Array.from({length: 8}, (_, i) => daily(`h${i}`, `${String(9 + i).padStart(2, '0')}:30`));
    const list = s.buildSchedule(habits, none, prefs({remindersOn: true, nudgeOn: true}), at(21, 6), null);
    for (let i = 1; i < list.length; i++) assert.notEqual(list[i].body, list[i - 1].body, `items ${i - 1} and ${i}`);
  });

  test('a change today does not reword later days', () => {
    const habits = [daily('a', '10:00'), daily('b', '12:00'), daily('c', '14:00')];
    const before = s.buildSchedule(habits, none, REMINDERS, NOW, null);
    const after = s.buildSchedule(habits, new Set(['a']), REMINDERS, NOW, null);
    const laterDays = (list: PlannedNotification[]) => list.filter((n) => !n.id.endsWith('2026-10-21'));
    assert.deepEqual(laterDays(after), laterDays(before));
  });

  test('deterministic: the same input gives the same schedule', () => {
    const habits = [daily('a', '10:00'), daily('b', '12:00')];
    assert.deepEqual(s.buildSchedule(habits, none, REMINDERS, NOW, null), s.buildSchedule(habits, none, REMINDERS, NOW, null));
  });
});
