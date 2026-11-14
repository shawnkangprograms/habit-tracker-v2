import {useCallback, useRef, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {getGamificationStats} from '@/services/gamificationStats';// XP, level and streak, derived from local rows and reflections
import {onRemoteChange} from '@/db/remoteChanges';// data pulled from another device changed local rows
import {useSessionUid} from '@/services/session';
import {loadShared} from '@/services/statsStore';// shared with Home: reuse, join or load once
import {useStatsEntry} from '@/hooks/use-stats';
import {getLocalDateString} from '@/utils/dates';

type LoadReason = 'focus' | 'remote';

// Dev only: shows whether Progress reused Home's stats, joined a running load, or read the database itself
function storeLog(message: string) {
  if (__DEV__) console.log(`Stats store: ${message}`);
}

// The level, streak, medals and lifetime numbers (the old Profile screen's load, unchanged): read from the stats store
// Home shares, so no database work when Home already has today's. Reloads on focus, and while focused when data pulled
// from another device changes local rows (coalesced: one reload runs at a time, changes arriving meanwhile cause one
// more run after it). `failed` = the last load failed and nothing is shown.
export function useProgressStats() {
  const userId = useSessionUid() ?? undefined;// this screen is only reachable while signed in (presumed or confirmed)
  const entry = useStatsEntry();
  const stats = entry && entry.userId === userId ? entry.stats : null;
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async (reason: LoadReason) => {
    if (!userId) return;
    const startedAt = performance.now();
    const result = await loadShared(userId, getLocalDateString(), () => getGamificationStats(userId));
    const ms = Math.round(performance.now() - startedAt);
    if (result.source === 'reused') storeLog('reused');
    else if (result.source === 'joined') storeLog(`joined in-flight (${reason}, ${ms} ms)`);
    else storeLog(`loaded (Progress, ${reason}) in ${ms} ms`);
    setFailed(result.entry === null);
  }, [userId]);

  const remoteReload = useRef({running: false, again: false});
  const reloadForRemote = useCallback(async () => {
    const state = remoteReload.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        await refresh('remote');
      } while (state.again);
    } finally {
      state.running = false;
    }
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    refresh('focus');
    // while focused, data pulled from another device updates Progress and the tab icon in place
    return onRemoteChange(reloadForRemote);
  }, [refresh, reloadForRemote]));

  return {stats, failed};
}
