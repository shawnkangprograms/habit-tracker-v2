import AsyncStorage from '@react-native-async-storage/async-storage';
import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {codedError, withTimeout} from '@/services/admin';
import {createProfileCompletion} from '@/services/profileCompletionCore';
import {PROFILE_WRITE_TIMEOUT_MS, type PendingProfile} from '@/utils/profilePending';

// The app's profile completer (services/profileCompletionCore.ts) on AsyncStorage and Firestore. Creating it reads
// nothing. The profile is the users/{uid} document the rules allow at creation: age, firstName, lastName, createdAt.

// Rejects with a network-style code if the write isn't confirmed within 10 s. The write itself stays queued in the
// SDK and may still land; the completer reads the server before writing again.
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(codedError('deadline-exceeded', 'Profile write timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function createProfileDoc(uid: string, profile: PendingProfile): Promise<void> {
  const {doc, serverTimestamp, setDoc} = firestore();
  const ref = doc(getFirestoreDb(), 'users', uid);
  await within(setDoc(ref, {
    age: profile.age, firstName: profile.firstName, lastName: profile.lastName, createdAt: serverTimestamp(),
  }), PROFILE_WRITE_TIMEOUT_MS);
}

async function profileExists(uid: string): Promise<boolean> {
  const {doc, getDocFromServer} = firestore();
  return (await withTimeout(getDocFromServer(doc(getFirestoreDb(), 'users', uid)))).exists();
}

export const profileCompletion = createProfileCompletion({
  storage: AsyncStorage,
  server: {exists: profileExists, create: createProfileDoc},
});

// The recovery screen (app/profile-setup.tsx): open while mounted, so it is never pushed twice
let setupOpen = false;
export const profileSetupScreen = {
  isOpen: () => setupOpen,
  setOpen: (open: boolean) => {
    setupOpen = open;
  },
};
