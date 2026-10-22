// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {PlannedNotification} from '../utils/notificationSchedule.ts';

const {createApplier, fingerprint} = await import('../services/notificationApplier.ts');

// In-memory stand-in for expo-notifications, counting native calls
function fakeApi(initial: {identifier: string; data?: Record<string, unknown>}[] = []) {
  const scheduled = new Map(initial.map((n) => [n.identifier, n.data ?? {}]));
  const calls = {schedule: 0, cancel: 0};
  let failSchedule = false;
  return {
    scheduled,
    calls,
    failNextSchedules() { failSchedule = true; },
    api: {
      async getAllScheduled() { return [...scheduled].map(([identifier, data]) => ({identifier, data})); },
      async cancel(id: string) { calls.cancel += 1; scheduled.delete(id); },
      async schedule(n: PlannedNotification, fp: string) {
        calls.schedule += 1;
        if (failSchedule) throw new Error('native error');
        scheduled.set(n.id, {fp});
      },
    },
  };
}

const plan = (id: string, fireAt: number, body = 'Ready when you are.'): PlannedNotification =>
  ({id, fireAt, title: 'Read', body, kind: 'habit', alarm: false, leadMin: 0});

describe('notification applier', () => {
  test('first apply schedules everything; the same plan again makes no native calls', async () => {
    const fake = fakeApi();
    const applier = createApplier(fake.api);
    const planned = [plan('hq:habit:a:2026-10-21', 1000), plan('hq:nudge:2026-10-21', 2000)];
    assert.deepEqual(await applier.apply(planned), {scheduled: 2, cancelled: 0, kept: 0, failed: 0});
    assert.deepEqual(await applier.apply(planned), {scheduled: 0, cancelled: 0, kept: 2, failed: 0});
    assert.deepEqual(fake.calls, {schedule: 2, cancel: 0});
  });

  test('a changed time or text is cancelled and scheduled again; a removed one is cancelled', async () => {
    const fake = fakeApi();
    const applier = createApplier(fake.api);
    await applier.apply([plan('hq:a', 1000), plan('hq:b', 2000), plan('hq:c', 3000)]);
    const result = await applier.apply([plan('hq:a', 1000), plan('hq:b', 2500), plan('hq:d', 4000, 'Time for today\'s check-in.')]);
    assert.deepEqual(result, {scheduled: 2, cancelled: 2, kept: 1, failed: 0});
    assert.deepEqual([...fake.scheduled.keys()].sort(), ['hq:a', 'hq:b', 'hq:d']);
    assert.equal(fake.scheduled.get('hq:b')?.fp, fingerprint(plan('hq:b', 2500)));
  });

  test('fingerprint: unchanged format for lead 0 and alarm off; lead and alarm change it', () => {
    const p = plan('hq:a', 1000);
    assert.equal(fingerprint(p), '1000|Read|Ready when you are.', 'same as before alarm and lead existed');
    assert.equal(fingerprint({...p, alarm: true}), '1000|Read|Ready when you are.|alarm');
    assert.equal(fingerprint({...p, leadMin: 15}), '1000|Read|Ready when you are.|lead15');
    assert.notEqual(fingerprint({...p, leadMin: 15}), fingerprint({...p, leadMin: 30}));
  });

  test('flipping the alarm reschedules exactly that notification', async () => {
    const fake = fakeApi();
    const applier = createApplier(fake.api);
    await applier.apply([plan('hq:a', 1000), plan('hq:b', 2000)]);
    const result = await applier.apply([{...plan('hq:a', 1000), alarm: true}, plan('hq:b', 2000)]);
    assert.deepEqual(result, {scheduled: 1, cancelled: 1, kept: 1, failed: 0});
  });

  test('plan change "early only" -> "early + due": the old hq:habit at the early time is cancelled, both scheduled', async () => {
    const {buildSchedule} = await import('../utils/notificationSchedule.ts');
    const {DEFAULT_NOTIFICATION_PREFS} = await import('../utils/notificationPrefs.ts');
    const now = new Date(2026, 9, 21, 9, 0);
    const habit = {habitId: 'h1', habitName: 'Read', frequencyType: 'weekdays' as const, days: ['wed' as const],
      reminderTime: '18:00', alarm: false, remindBeforeMin: 10};
    // what the previous build scheduled: ONE hq:habit notification at the early time, with the lead fingerprint
    const old: PlannedNotification = {id: 'hq:habit:h1:2026-10-21', fireAt: new Date(2026, 9, 21, 17, 50).getTime(),
      title: 'Read', body: 'Starts in 10 minutes.', kind: 'habit', alarm: false, leadMin: 10};
    const fake = fakeApi([{identifier: old.id, data: {fp: fingerprint(old)}}]);

    const planned = buildSchedule([habit], new Set(), {...DEFAULT_NOTIFICATION_PREFS, remindersOn: true}, now, null);
    assert.deepEqual(planned.map((n) => n.id), ['hq:early:h1:2026-10-21', 'hq:habit:h1:2026-10-21']);
    const result = await createApplier(fake.api).apply(planned);
    assert.deepEqual(result, {scheduled: 2, cancelled: 1, kept: 0, failed: 0});
    assert.equal(fake.scheduled.get('hq:habit:h1:2026-10-21')?.fp, fingerprint(planned[1]));
    assert.ok(fingerprint(planned[1]).startsWith(`${new Date(2026, 9, 21, 18, 0).getTime()}|`), 'now at the due time');

    // the user removes the heads-up (lead None): only the early one is cancelled, the due one is kept
    const noLead = buildSchedule([{...habit, remindBeforeMin: 0}], new Set(), {...DEFAULT_NOTIFICATION_PREFS, remindersOn: true}, now, null);
    assert.deepEqual(await createApplier(fake.api).apply(noLead), {scheduled: 0, cancelled: 1, kept: 1, failed: 0});
    assert.deepEqual([...fake.scheduled.keys()], ['hq:habit:h1:2026-10-21']);
  });

  test('the Settings test notification (hqtest:) is never cancelled, whatever the plan', async () => {
    const {TEST_NOTIFICATION_ID} = await import('../services/notificationsCore.ts');
    const fake = fakeApi([{identifier: TEST_NOTIFICATION_ID, data: {test: true}}, {identifier: 'hq:old', data: {fp: 'x'}}]);
    const applier = createApplier(fake.api);
    await applier.apply([]);
    await applier.apply([plan('hq:a', 1000)]);
    assert.equal(fake.scheduled.has(TEST_NOTIFICATION_ID), true);
    assert.equal(fake.scheduled.has('hq:old'), false, 'a stale hq: id is still cleaned up');
  });

  test('only our own ids (hq:) are ever touched', async () => {
    const fake = fakeApi([{identifier: 'someone-else', data: {}}, {identifier: 'hq:old', data: {fp: 'x'}}]);
    await createApplier(fake.api).apply([]);
    assert.deepEqual([...fake.scheduled.keys()], ['someone-else']);
  });

  test('an unknown fingerprint (e.g. scheduled by an older version) is replaced', async () => {
    const fake = fakeApi([{identifier: 'hq:a', data: {}}]);
    const result = await createApplier(fake.api).apply([plan('hq:a', 1000)]);
    assert.deepEqual(result, {scheduled: 1, cancelled: 1, kept: 0, failed: 0});
  });

  test('native failures never throw', async () => {
    const fake = fakeApi();
    fake.failNextSchedules();
    const result = await createApplier(fake.api).apply([plan('hq:a', 1000)]);
    assert.equal(result.failed, 1);

    const original = console.log;
    console.log = () => {};
    try {
      const broken = createApplier({...fake.api, async getAllScheduled() { throw new Error('no module'); }});
      assert.deepEqual(await broken.apply([plan('hq:a', 1000)]), {scheduled: 0, cancelled: 0, kept: 0, failed: 1});
    } finally {
      console.log = original;
    }
  });

  test('applies run one at a time, in call order', async () => {
    const fake = fakeApi();
    const applier = createApplier(fake.api);
    const first = applier.apply([plan('hq:a', 1000)]);
    const second = applier.apply([]);
    await Promise.all([first, second]);
    assert.equal(fake.scheduled.size, 0);
  });
});
