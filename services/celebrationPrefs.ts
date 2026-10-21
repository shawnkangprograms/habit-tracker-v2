import {useEffect, useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Settings switch "Celebrations and messages": per device (not per account), default on.
// Off hides overlays, banners and toasts only; XP, streaks and all data are unaffected.

const KEY = 'prefs:celebrations';

let enabled = true;
let changedThisRun = false;// a switch flip before the saved value arrives wins over it
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

// Reads the saved value once per app run. A failed read keeps the default (on).
function loadOnce(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw === '0' && enabled && !changedThisRun) {
          enabled = false;
          notify();
        }
      })
      .catch(() => {});
  }
  return loading;
}

export function getCelebrationsEnabled(): boolean {
  return enabled;
}

export function setCelebrationsEnabled(value: boolean): void {
  changedThisRun = true;
  if (value === enabled) return;
  enabled = value;
  notify();
  AsyncStorage.setItem(KEY, value ? '1' : '0').catch((err: unknown) => console.log('Saving the celebrations setting failed', err));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCelebrationsEnabled(): boolean {
  useEffect(() => {
    loadOnce();
  }, []);
  return useSyncExternalStore(subscribe, getCelebrationsEnabled);
}
