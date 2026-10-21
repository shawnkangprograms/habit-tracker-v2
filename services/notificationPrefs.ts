import {useEffect, useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_NOTIFICATION_PREFS, parseNotificationPrefs, type NotificationPrefs} from '@/utils/notificationPrefs';

// Notification settings, per device, in AsyncStorage (like services/celebrationPrefs.ts). All off by default.

const KEY = 'prefs:notifications:v1';

let prefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS;
let loaded = false;
let loading: Promise<NotificationPrefs> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

// Reads the saved value once per app run. A failed read keeps the defaults (everything off).
export function loadNotificationPrefs(): Promise<NotificationPrefs> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        prefs = parseNotificationPrefs(raw);
      })
      .catch(() => {})
      .then(() => {
        loaded = true;
        notify();
        return prefs;
      });
  }
  return loading;
}

export function getNotificationPrefs(): NotificationPrefs {
  return prefs;
}

export function notificationPrefsLoaded(): boolean {
  return loaded;
}

// Applied on top of the saved settings (waits for them first), so an early change never loses other fields
export async function setNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  await loadNotificationPrefs();
  prefs = {...prefs, ...patch};
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (err) {
    console.log('Saving notification settings failed', err);
  }
}

export function subscribeNotificationPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotificationPrefs(): NotificationPrefs {
  useEffect(() => {
    loadNotificationPrefs();
  }, []);
  return useSyncExternalStore(subscribeNotificationPrefs, getNotificationPrefs);
}
