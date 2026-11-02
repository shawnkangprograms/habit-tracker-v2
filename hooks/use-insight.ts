import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {homeUsable, startAfter} from '@/services/startupSignals';
import {createAppInsightRunner, onAuthConfirmed} from '@/services/insights';
import type {InsightRunner, InsightView} from '@/utils/insightSchedule';

// The cache is read as soon as Home is usable; the first request check runs 3 s later. The fallbacks cover a
// Home that never becomes usable. Later checks: Home regaining focus, the app returning to the foreground, and
// Firebase confirming the user. Each one is a cheap no-op when a request is not due (utils/insightSchedule.ts).
const CACHE_AFTER_HOME_MS = 0;
const CACHE_FALLBACK_MS = 8 * 1000;
const REQUEST_AFTER_HOME_MS = 3 * 1000;
const REQUEST_FALLBACK_MS = 11 * 1000;

// Runs `fn` and swallows anything it throws: the insight card must never break Home
function safely(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.log('Insight card setup failed', err);
  }
}

// The insight card's state for this user, or null until the cache has been read (the card renders nothing).
// The card is keyed by uid on Home, so another user always starts from a fresh mount.
export function useInsight(userId: string): InsightView | null {
  const [view, setView] = useState<InsightView | null>(null);
  const runnerRef = useRef<InsightRunner | null>(null);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    safely(() => {
      const runner = createAppInsightRunner(userId, (next) => setView(next.cacheRead ? next : null));
      runnerRef.current = runner;
      cleanups.push(() => runner.dispose());
      cleanups.push(startAfter(homeUsable, () => {
        runner.readCache();
      }, {afterMs: CACHE_AFTER_HOME_MS, fallbackMs: CACHE_FALLBACK_MS}));
      cleanups.push(startAfter(homeUsable, () => {
        runner.start();
      }, {afterMs: REQUEST_AFTER_HOME_MS, fallbackMs: REQUEST_FALLBACK_MS}));
      const appStateSub = AppState.addEventListener('change', (next) => {
        if (next === 'active') runner.maybeRequest();
      });
      cleanups.push(() => appStateSub.remove());
      cleanups.push(onAuthConfirmed(() => runner.maybeRequest()));
    });
    return () => {
      runnerRef.current = null;
      for (const cleanup of cleanups) safely(cleanup);
    };
  }, [userId]);

  useFocusEffect(useCallback(() => {
    safely(() => {
      runnerRef.current?.maybeRequest();
    });
  }, []));

  return view;
}
