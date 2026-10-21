import {useSyncExternalStore} from 'react';
import {getEntry, subscribe, type StatsEntry} from '@/services/statsStore';

// The shared stats entry (services/statsStore.ts). Re-renders only the calling component, and only
// when a publish changed the stats. null until Home or Profile has loaded them for the signed-in user.
export function useStatsEntry(): StatsEntry | null {
  return useSyncExternalStore(subscribe, getEntry);
}
