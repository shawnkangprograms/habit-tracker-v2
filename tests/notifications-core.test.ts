// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {NotificationsModule} from '../services/notificationsCore.ts';
import type {PlannedNotification} from '../utils/notificationSchedule.ts';

const {createNotifications, REMINDERS_CHANNEL} = await import('../services/notificationsCore.ts');
const {createApplier} = await import('../services/notificationApplier.ts');

const planned: PlannedNotification = {id: 'hq:habit:a:2026-10-21', fireAt: 1_000, title: 'Read', body: 'Ready when you are.', kind: 'habit'};

// A stand-in for expo-notifications with just what notificationsCore uses; records the calls
function fakeModule(permission: {granted: boolean; status: string; canAskAgain: boolean; ios?: {status: number}}, afterRequest = permission) {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, ...args: unknown[]) => { (calls[name] ??= []).push(args); };
  const mod = {
    AndroidImportance: {DEFAULT: 5},
    IosAuthorizationStatus: {PROVISIONAL: 3},
    SchedulableTriggerInputTypes: {DATE: 'date'},
    setNotificationHandler: (h: unknown) => record('setNotificationHandler', h),
    setNotificationChannelAsync: async (...a: unknown[]) => { record('setNotificationChannelAsync', ...a); return null; },
    getPermissionsAsync: async () => { record('getPermissionsAsync'); return permission; },
    requestPermissionsAsync: async () => { record('requestPermissionsAsync'); return afterRequest; },
    getAllScheduledNotificationsAsync: async () => [{identifier: 'hq:x', content: {data: {fp: '1'}}}],
    cancelScheduledNotificationAsync: async (id: string) => { record('cancel', id); },
    scheduleNotificationAsync: async (req: unknown) => { record('schedule', req); return 'id'; },
    addNotificationResponseReceivedListener: (fn: () => void) => { record('listen', fn); return {remove: () => record('remove')}; },
  };
  return {mod: mod as unknown as NotificationsModule, calls};
}

describe('notifications: module missing (e.g. Android Expo Go)', () => {
  test('the loader throwing means unavailable, reported once, and no function throws', async () => {
    let loads = 0;
    let reported = 0;
    const n = createNotifications(() => {
      loads += 1;
      throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
    }, {isAndroid: true, onUnavailable: () => { reported += 1; }});

    assert.equal(n.available(), false);
    assert.equal(n.available(), false);
    await n.ensureReminderChannel();
    assert.equal(await n.getPermission(), 'unavailable');
    assert.equal(await n.requestPermission(), false);
    assert.deepEqual(await n.api.getAllScheduled(), []);
    await n.api.cancel('hq:x');
    await n.api.schedule(planned, 'fp');
    const unsubscribe = n.addTapListener(() => {});
    unsubscribe();
    assert.equal(loads, 1, 'tried once, then cached');
    assert.equal(reported, 1);
  });

  test('the applier on an unavailable module never fails (the scheduler skips it anyway)', async () => {
    const n = createNotifications(() => { throw new Error('missing'); }, {isAndroid: true});
    const result = await createApplier(n.api).apply([planned]);
    assert.equal(result.failed, 0);
    assert.equal(result.cancelled, 0);
  });

  test('a module that loads but fails while setting the handler also counts as unavailable', () => {
    const {mod} = fakeModule({granted: true, status: 'granted', canAskAgain: true});
    const broken = {...mod, setNotificationHandler: () => { throw new Error('native'); }} as unknown as NotificationsModule;
    assert.equal(createNotifications(() => broken, {isAndroid: false}).available(), false);
  });
});

describe('notifications: module present', () => {
  test('available; the foreground handler is set once with the approved behaviour (D4)', async () => {
    const {mod, calls} = fakeModule({granted: true, status: 'granted', canAskAgain: true});
    const n = createNotifications(() => mod, {isAndroid: false});
    assert.equal(n.available(), true);
    n.available();
    assert.equal(calls.setNotificationHandler.length, 1);
    const handler = calls.setNotificationHandler[0][0] as {handleNotification: () => Promise<unknown>};
    assert.deepEqual(await handler.handleNotification(),
      {shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false});
  });

  test('permission states: granted, provisional (iOS), undetermined, denied', async () => {
    const state = async (p: Parameters<typeof fakeModule>[0]) =>
      createNotifications(() => fakeModule(p).mod, {isAndroid: false}).getPermission();
    assert.equal(await state({granted: true, status: 'granted', canAskAgain: true}), 'granted');
    assert.equal(await state({granted: false, status: 'denied', canAskAgain: false, ios: {status: 3}}), 'granted');
    assert.equal(await state({granted: false, status: 'undetermined', canAskAgain: true}), 'undetermined');
    assert.equal(await state({granted: false, status: 'denied', canAskAgain: false}), 'denied');
  });

  test('request: asks only if it still may; creates the Android channel first, once', async () => {
    const asked = fakeModule({granted: false, status: 'undetermined', canAskAgain: true}, {granted: true, status: 'granted', canAskAgain: true});
    const n = createNotifications(() => asked.mod, {isAndroid: true});
    assert.equal(await n.requestPermission(), true);
    await n.ensureReminderChannel();
    assert.equal(asked.calls.setNotificationChannelAsync.length, 1);
    assert.deepEqual(asked.calls.setNotificationChannelAsync[0], [REMINDERS_CHANNEL, {name: 'Reminders', importance: 5}]);
    assert.equal(asked.calls.requestPermissionsAsync.length, 1);

    const blocked = fakeModule({granted: false, status: 'denied', canAskAgain: false});
    assert.equal(await createNotifications(() => blocked.mod, {isAndroid: false}).requestPermission(), false);
    assert.equal(blocked.calls.requestPermissionsAsync, undefined, 'never prompts when the system says no');
  });

  test('schedule uses a one-off DATE trigger on the reminders channel with our id; tap listener subscribes', async () => {
    const {mod, calls} = fakeModule({granted: true, status: 'granted', canAskAgain: true});
    const n = createNotifications(() => mod, {isAndroid: true});
    await n.api.schedule(planned, 'fp1');
    assert.deepEqual(calls.schedule[0][0], {
      identifier: planned.id,
      content: {title: 'Read', body: 'Ready when you are.', data: {fp: 'fp1'}},
      trigger: {type: 'date', date: 1_000, channelId: REMINDERS_CHANNEL},
    });
    assert.deepEqual(await n.api.getAllScheduled(), [{identifier: 'hq:x', data: {fp: '1'}}]);
    const off = n.addTapListener(() => {});
    off();
    assert.equal(calls.listen.length, 1);
    assert.equal(calls.remove.length, 1);
  });

  test('a native call failing inside the module never throws to callers', async () => {
    const {mod} = fakeModule({granted: true, status: 'granted', canAskAgain: true});
    const failing = {...mod, getPermissionsAsync: async () => { throw new Error('native'); }} as unknown as NotificationsModule;
    const n = createNotifications(() => failing, {isAndroid: false});
    const original = console.log;
    console.log = () => {};
    try {
      assert.equal(await n.getPermission(), 'denied');
      assert.equal(await n.requestPermission(), false);
    } finally {
      console.log = original;
    }
  });
});
