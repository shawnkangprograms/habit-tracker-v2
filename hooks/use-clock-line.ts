import {useEffect, useState} from 'react';
import {getSyncStatus, subscribeSyncStatus} from '@/sync/syncEngine';
import {clockLine} from '@/utils/syncStatusLine';

// Settings only: the S-1 clock line for the current sync status (utils/syncStatusLine.ts), or null. Subscribes while
// Settings is mounted; Home and the startup path never use this.
export function useClockLine(): string | null {
  const [line, setLine] = useState<string | null>(() => clockLine(getSyncStatus()));
  useEffect(() => {
    setLine(clockLine(getSyncStatus()));// a status change between the first render and this effect
    return subscribeSyncStatus((status: {clockSuspectCycles?: number}) => setLine(clockLine(status)));
  }, []);
  return line;
}
