import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {packsStore} from '@/services/packsStore';
import type {PacksState} from '@/services/packsStoreCore';
import {homeUsable} from '@/services/startupSignals';

// The signed-in user's packs (services/packsStoreCore.ts), re-rendering when they change (onboarding, the
// picker, "Add the rest", "Not now"). Usually there on the first render, from the mirror read with the sign-in
// marker. When it isn't (another account, or no mirror yet), the record is read once Home is usable, never
// during cold start; until then this is null and Home shows its habits unpacked.
export function usePacks(uid: string | null | undefined): PacksState | null {
  const getSnapshot = useCallback(() => (uid ? packsStore.peek(uid) ?? null : null), [uid]);
  const state = useSyncExternalStore(packsStore.subscribe, getSnapshot);
  const known = state !== null;
  useEffect(() => {
    if (!uid || known) return;
    return homeUsable.on(() => {
      packsStore.read(uid);// never throws; a failed read stays unknown
    });
  }, [uid, known]);
  return state;
}

// Which pack cards are expanded: in memory for this app run only, expanded by default
const expanded = new Map<string, boolean>();

export function usePackExpanded(uid: string, packId: string): [boolean, () => void] {
  const key = `${uid}:${packId}`;
  const [open, setOpen] = useState(() => expanded.get(key) ?? true);
  const toggle = useCallback(() => {
    setOpen((was) => {
      expanded.set(key, !was);
      return !was;
    });
  }, [key]);
  return [open, toggle];
}
