import AsyncStorage from '@react-native-async-storage/async-storage';
import {createEndSession} from '@/utils/authSession';

// The sign-in marker (see utils/authSession.ts): the uid Firebase last confirmed on this phone. Local only, no
// network. Writes and clears run one at a time in call order, so a clear issued after a write always lands last.

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
    const uid = await AsyncStorage.getItem(KEY);
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
