import {useEffect, useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_NOTIFICATION_PREFS, parseStoredNotificationPrefs, withDefaults, type NotificationPrefs,
  type StoredNotificationPrefs,
} from '@/utils/notificationPrefs';

// Notification settings, per device, in AsyncStorage (like services/celebrationPrefs.ts). Defaults in
// utils/notificationPrefs.ts (habit reminders on, nudge off). Only fields the user set are saved, so a default
// keeps applying to a field nobody chose, and a stored choice (on or off) is always kept.

const KEY = 'prefs:notifications:v1';

// Unknown must never turn reminders on over a stored "off": until a read succeeds (before the first read, or
// after a failed one), reminders count as off and nothing is saved over what is stored
const UNREAD_PREFS: NotificationPrefs = {...DEFAULT_NOTIFICATION_PREFS, remindersOn: false};

let stored: StoredNotificationPrefs = {};
let prefs: NotificationPrefs = UNREAD_PREFS;
let readOk = false;
let loaded = false;
let loading: Promise<NotificationPrefs> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

async function readStored(): Promise<boolean> {
  try {
    stored = parseStoredNotificationPrefs(await AsyncStorage.getItem(KEY));
    prefs = withDefaults(stored);
    readOk = true;
  } catch {
    prefs = UNREAD_PREFS;
  }
  return readOk;
}

// Reads the saved value once per app run (a save retries a failed read)
export function loadNotificationPrefs(): Promise<NotificationPrefs> {
  if (!loading) {
    loading = readStored().then(() => {
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

// Applied on top of the saved settings (waits for them first), so an early change never loses other fields.
// If the saved settings still can't be read, the change applies for this run only and is not saved.
export async function setNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<void> {
  await loadNotificationPrefs();
  if (!readOk && !(await readStored())) {
    prefs = {...prefs, ...patch};
    notify();
    console.log('Notification settings could not be read, so this change is not saved');
    return;
  }
  stored = {...stored, ...patch};
  prefs = withDefaults(stored);
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
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
