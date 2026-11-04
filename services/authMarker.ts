import AsyncStorage from '@react-native-async-storage/async-storage';
import {createEndSession} from '@/utils/authSession';
import {PROFILE_NAME_KEY} from '@/utils/profileName';
import {profileNameStore} from '@/services/profileName';
import {PACKS_MIRROR_KEY} from '@/utils/packs/record';
import {packsStore} from '@/services/packsStore';

// The sign-in marker (see utils/authSession.ts): the uid Firebase last confirmed on this phone. Local only, no
// network. Writes and clears run one at a time in call order, so a clear issued after a write always lands last.
// The greeting's name (utils/profileName.ts) and the pack record's mirror (utils/packs/record.ts) are read in the
// same native call, so they are there for Home's first render at no extra cost.

const KEY = 'auth:lastUid:v1';

let chain: Promise<unknown> = Promise.resolve();

function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task);
  chain = run.catch(() => {});
  return run;
}

// Never throws: a failed or empty read is "no marker", so the app waits for Firebase as before
export async function readMarker(): Promise<string | null> {
  try {
    const values = new Map(await AsyncStorage.multiGet([KEY, PROFILE_NAME_KEY, PACKS_MIRROR_KEY]));
    profileNameStore.load(values.get(PROFILE_NAME_KEY) ?? null);// used only if its uid matches (services/profileName.ts)
    packsStore.loadMirror(values.get(PACKS_MIRROR_KEY) ?? null);// likewise (services/packsStoreCore.ts)
    const uid = values.get(KEY);
    return uid && uid.length > 0 ? uid : null;
  } catch {
    return null;
  }
}

// Never throws: without a marker the next launch just waits for Firebase
export function writeMarker(uid: string): Promise<void> {
  return inOrder(() => AsyncStorage.setItem(KEY, uid)).catch((err: unknown) => {
    console.log('Saving the sign-in marker failed', err);
  });
}

// Throws if it fails, so a sign-out can refuse to go ahead (endSession)
export function clearMarker(): Promise<void> {
  return inOrder(() => AsyncStorage.removeItem(KEY));
}

export const endSession = createEndSession({clearMarker});
