import {useCallback, useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createProfileNameStore} from '@/services/profileNameCore';
import type {ProfileName} from '@/utils/profileName';

// The app's name store (services/profileNameCore.ts) on AsyncStorage. Creating it reads nothing.
export const profileNameStore = createProfileNameStore(AsyncStorage);

// The signed-in user's name, re-rendering when it changes (sign-up, Settings, the refresh after sign-in)
export function useProfileName(uid: string | null | undefined): ProfileName | null {
  const getSnapshot = useCallback(() => profileNameStore.get(uid), [uid]);
  return useSyncExternalStore(profileNameStore.subscribe, getSnapshot);
}
