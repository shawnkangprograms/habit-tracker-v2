import {useEffect, useState} from 'react';
import {getSyncStatus, subscribeSyncStatus} from '@/sync/syncEngine';
import {syncLines} from '@/utils/syncStatusLine';

type LineStatus = {clockSuspectCycles?: number; cursorReadFailures?: number};

// Settings only: the sync lines for the current sync status (utils/syncStatusLine.ts: the S-1 clock line and the
// R-1 cursor line), possibly none. Subscribes while Settings is mounted; Home and the startup path never use this.
export function useSyncLines(): string[] {
  const [lines, setLines] = useState<string[]>(() => syncLines(getSyncStatus()));
  useEffect(() => {
    setLines(syncLines(getSyncStatus()));// a status change between the first render and this effect
    return subscribeSyncStatus((status: LineStatus) => {
      const next = syncLines(status);
      setLines((current) => (current.join('\n') === next.join('\n') ? current : next));
    });
  }, []);
  return lines;
}
