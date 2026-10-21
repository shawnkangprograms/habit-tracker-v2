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
  ({id, fireAt, title: 'Read', body, kind: 'habit'});

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
