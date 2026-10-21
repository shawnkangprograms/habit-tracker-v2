// expo-notifications behind a lazy loader, so a phone whose app binary lacks the native module (e.g. Expo Go
// on Android: "Cannot find native module 'ExpoTopicSubscriptionModule'") never crashes: notifications are just
// "unavailable" for that app run. The module is loaded on first use, once, and every function here is safe
// either way and never throws. The loader is injected (a require in services/notifications.ts, a fake in tests).

import type * as ExpoNotifications from 'expo-notifications';
import type {NotificationsApi} from '@/services/notificationApplier';

export type NotificationsModule = typeof ExpoNotifications;
export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'unavailable';

export const REMINDERS_CHANNEL = 'reminders';

export function createNotifications(load: () => NotificationsModule, options: {
  isAndroid: boolean;
  onUnavailable?: (err: unknown) => void;// called once, the first time loading fails
}) {
  let loaded: {mod: NotificationsModule | null} | null = null;

  function mod(): NotificationsModule | null {
    if (!loaded) {
      try {
        const m = load();
        // Foreground: a silent banner and an entry in the list, no badge. From the SDK 57 types: on Android,
        // shouldPlaySound false also means no drop-down banner while the app is open (it still goes to the shade).
        m.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
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

  // Asks only if the system still allows asking. Only ever called from a user's tap (a switch or the soft prompt).
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

  // The API for services/notificationApplier.ts: one-off DATE triggers on the reminders channel.
  // When unavailable: nothing is scheduled and nothing is listed.
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
      await m.scheduleNotificationAsync({
        identifier: n.id,
        content: {title: n.title, body: n.body, data: {fp}},
        trigger: {type: m.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: REMINDERS_CHANNEL},
      });
    },
  };

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

  return {available, ensureReminderChannel, getPermission, requestPermission, api, addTapListener};
}
