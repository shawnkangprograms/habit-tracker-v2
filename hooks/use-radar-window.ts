import {useSyncExternalStore} from 'react';
import type {RadarWindowId} from '@/utils/radar/score';

// The one Week/Month choice shared by Home's radar card and Summary's Week/Month toggle (docs/PACKS_REPORTS_SPEC.md,
// section 11). In memory for the app run only: Week after every launch, never stored.

let current: RadarWindowId = 'week';
const listeners = new Set<() => void>();

export function setRadarWindow(next: RadarWindowId): void {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;

export function useRadarWindow(): RadarWindowId {
  return useSyncExternalStore(subscribe, getSnapshot);
}
