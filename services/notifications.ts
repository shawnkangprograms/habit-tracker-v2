import {useEffect} from 'react';
import {router} from 'expo-router';
import type {NotificationsApi} from '@/services/notificationApplier';
import {createNotifications, type NotificationsModule, type PermissionState} from '@/services/notificationsCore';

// Local notifications for the app (reminders and the evening nudge). expo-notifications is NEVER imported at
// the top level: a top-level import crashed every tab on Android Expo Go (SDK 57: "Cannot find native module
// 'ExpoTopicSubscriptionModule'"). It is required lazily, once, inside a try/catch (services/notificationsCore.ts);
// if that fails, notifications are unavailable for this app run and everything below is a safe no-op.

export {REMINDERS_CHANNEL} from '@/services/notificationsCore';
export type {PermissionState} from '@/services/notificationsCore';

let loggedUnavailable = false;

const notifications = createNotifications(
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be a lazy require (see above)
  () => require('expo-notifications') as NotificationsModule,
  {
    isAndroid: process.env.EXPO_OS === 'android',
    onUnavailable: (err) => {
      if (__DEV__ && !loggedUnavailable) {
        loggedUnavailable = true;
        console.log('Notifications: unavailable in this app binary, reminders are off for this run', err);
      }
    },
  },
);

// True only if the notifications module loaded (loads it on the first call)
export function notificationsAvailable(): boolean {
  return notifications.available();
}

export function ensureReminderChannel(): Promise<void> {
  return notifications.ensureReminderChannel();
}

export function getNotificationPermission(): Promise<PermissionState> {
  return notifications.getPermission();
}

export function requestNotificationPermission(): Promise<boolean> {
  return notifications.requestPermission();
}

export const nativeNotificationsApi: NotificationsApi = notifications.api;

// Tapping any notification opens the app on Home (the app also starts on Home after a cold start).
// Does nothing when notifications are unavailable.
export function useNotificationTapOpensHome(): void {
  useEffect(() => notifications.addTapListener(() => router.navigate('/')), []);
}
