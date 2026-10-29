// expo-notifications behind a lazy loader, so a phone whose app binary lacks the native module (e.g. Expo Go
// on Android: "Cannot find native module 'ExpoTopicSubscriptionModule'") never crashes: notifications are just
// "unavailable" for that app run. The module is loaded on first use, once, and every function here is safe
// either way and never throws. The loader is injected (a require in services/notifications.ts, a fake in tests).

import type * as ExpoNotifications from 'expo-notifications';
import type {NotificationsApi} from '@/services/notificationApplier';

export type NotificationsModule = typeof ExpoNotifications;
export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'unavailable';

export const REMINDERS_CHANNEL = 'reminders';
// Habits with "Alarm sound" on. Android channels can't be changed once created, so this is a new id (v1)
// with its own importance, sound and vibration; a later change to them needs a new id.
export const ALARM_CHANNEL = 'hq-alarm-v1';

// The Settings test notification. NOT "hq:": the applier cancels every "hq:" id that is not in its plan.
export const TEST_ID_PREFIX = 'hqtest:';
export const TEST_NOTIFICATION_ID = `${TEST_ID_PREFIX}notification`;
export const TEST_DELAY_MS = 10 * 1000;

export function createNotifications(load: () => NotificationsModule, options: {
  isAndroid: boolean;
  onUnavailable?: (err: unknown) => void;// called once, the first time loading fails
}) {
  let loaded: {mod: NotificationsModule | null} | null = null;

  function mod(): NotificationsModule | null {
    if (!loaded) {
      try {
        const m = load();
        // Foreground: a banner and an entry in the list for every notification, no badge, and a sound only for
        // alarm notifications (data.alarm, set when scheduling). Flag names from the SDK 57 types
        // (shouldShowAlert is deprecated). On Android, shouldPlaySound false also means no drop-down banner
        // while the app is open (it still goes to the shade). A failure or timeout in here is logged, not
        // silent: iOS then shows nothing while the app is open.
        m.setNotificationHandler({
          handleNotification: async (notification) => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: notification?.request?.content?.data?.alarm === true,
            shouldSetBadge: false,
          }),
          handleError: (id, error) => console.log('Showing a notification while the app is open failed', id, error),
        });
        loaded = {mod: m};
      } catch (err) {
        loaded = {mod: null};
        options.onUnavailable?.(err);
      }
    }
    return loaded.mod;
  }

  function available(): boolean {
    return mod() !== null;
  }

  let channelReady: Promise<void> | null = null;

  // Android: the channel must exist before scheduling, and before asking permission (Android 13+ shows no
  // prompt until a channel exists). Default importance, no sound override. Resolves on iOS and when unavailable.
  function ensureReminderChannel(): Promise<void> {
    const m = mod();
    if (!m || !options.isAndroid) return Promise.resolve();
    if (!channelReady) {
      channelReady = Promise.resolve()
        .then(() => m.setNotificationChannelAsync(REMINDERS_CHANNEL, {name: 'Reminders', importance: m.AndroidImportance.DEFAULT}))
        .then(() => {})
        .catch((err: unknown) => {
          channelReady = null;// try again next time
          console.log('Creating the notification channel failed', err);
        });
    }
    return channelReady;
  }

  let alarmChannelReady: Promise<void> | null = null;

  // Android: the alarm channel (high importance, default sound, vibration), created lazily the first time an
  // alarm notification is scheduled. Resolves on iOS and when unavailable; a failure is retried next time.
  function ensureAlarmChannel(): Promise<void> {
    const m = mod();
    if (!m || !options.isAndroid) return Promise.resolve();
    if (!alarmChannelReady) {
      alarmChannelReady = Promise.resolve()
        .then(() => m.setNotificationChannelAsync(ALARM_CHANNEL, {
          name: 'Habit alarms',
          importance: m.AndroidImportance.HIGH,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 400, 250, 400],
        }))
        .then(() => {})
        .catch((err: unknown) => {
          alarmChannelReady = null;// try again next time
          console.log('Creating the alarm channel failed', err);
        });
    }
    return alarmChannelReady;
  }

  function allowed(m: NotificationsModule, status: ExpoNotifications.NotificationPermissionsStatus): boolean {
    return status.granted || status.ios?.status === m.IosAuthorizationStatus.PROVISIONAL;
  }

  // Never asks. "denied" = the user said no (or turned notifications off in the phone's settings);
  // "unavailable" = this app binary has no notifications module.
  async function getPermission(): Promise<PermissionState> {
    const m = mod();
    if (!m) return 'unavailable';
    try {
      const status = await m.getPermissionsAsync();
      if (allowed(m, status)) return 'granted';
      return status.status === 'undetermined' ? 'undetermined' : 'denied';
    } catch {
      return 'denied';
    }
  }

  // Asks only if the system still allows asking. Only ever called from a user's tap (a switch, the soft prompt,
  // the test notification, or saving a habit with a reminder time).
  async function requestPermission(): Promise<boolean> {
    const m = mod();
    if (!m) return false;
    try {
      await ensureReminderChannel();
      const current = await m.getPermissionsAsync();
      if (allowed(m, current)) return true;
      if (!current.canAskAgain) return false;
      return allowed(m, await m.requestPermissionsAsync());
    } catch (err) {
      console.log('Notification permission request failed', err);
      return false;
    }
  }

  // The API for services/notificationApplier.ts: one-off DATE triggers on the reminders channel, or with a
  // sound on the alarm channel for alarm notifications. When unavailable: nothing is scheduled or listed.
  const api: NotificationsApi = {
    async getAllScheduled() {
      const m = mod();
      if (!m) return [];
      const requests = await m.getAllScheduledNotificationsAsync();
      return requests.map((r) => ({identifier: r.identifier, data: r.content.data}));
    },
    async cancel(identifier) {
      const m = mod();
      if (m) await m.cancelScheduledNotificationAsync(identifier);
    },
    async schedule(n, fp) {
      const m = mod();
      if (!m) return;
      if (n.alarm) {
        await ensureAlarmChannel();
        await m.scheduleNotificationAsync({
          identifier: n.id,
          content: {title: n.title, body: n.body, sound: true, data: {fp, alarm: true}},
          trigger: {type: m.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: ALARM_CHANNEL},
        });
        return;
      }
      await m.scheduleNotificationAsync({
        identifier: n.id,
        content: {title: n.title, body: n.body, data: {fp}},
        trigger: {type: m.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: REMINDERS_CHANNEL},
      });
    },
  };

  // Settings: one quiet notification on the reminders channel, TEST_DELAY_MS from now. A pending one is
  // cancelled first, so tapping again replaces it. Never throws: true if it was scheduled. Permission is the
  // caller's job (it goes through the usual request flow first).
  async function sendTestNotification(): Promise<boolean> {
    const m = mod();
    if (!m) return false;
    try {
      await ensureReminderChannel();
      await m.cancelScheduledNotificationAsync(TEST_NOTIFICATION_ID).catch(() => {});
      await m.scheduleNotificationAsync({
        identifier: TEST_NOTIFICATION_ID,
        content: {title: 'HabitQuest', body: 'This is what a reminder looks like.', data: {test: true}},
        trigger: {type: m.SchedulableTriggerInputTypes.DATE, date: Date.now() + TEST_DELAY_MS, channelId: REMINDERS_CHANNEL},
      });
      return true;
    } catch (err) {
      console.log('Scheduling the test notification failed', err);
      return false;
    }
  }

  // Calls `onTap` when the user taps one of our notifications. Returns the unsubscribe; a no-op when unavailable.
  function addTapListener(onTap: () => void): () => void {
    const m = mod();
    if (!m) return () => {};
    try {
      const subscription = m.addNotificationResponseReceivedListener(() => onTap());
      return () => subscription.remove();
    } catch {
      return () => {};
    }
  }

  return {available, ensureReminderChannel, getPermission, requestPermission, api, addTapListener, sendTestNotification};
}
