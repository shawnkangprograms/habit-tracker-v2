import {useEffect} from 'react';
import {Alert, AppState} from 'react-native';
import {checkIsDisabled} from '@/services/accountStatus';
import {getFirebaseAuth} from '@/services/authInit';
import {signOut} from '@/services/authActions';
import {mark} from '@/utils/startupTrace';

// Signs the user out if an admin has disabled their account. Runs after each sign-in (or launch with a
// saved session) and whenever the app returns to the foreground. Never part of the readiness gate,
// and only a successful server read showing disabled === true (for a non-admin) signs anyone out.
export function useDisabledCheck(uid: string | null) {
  useEffect(() => {
    if (!uid) return;
    let active = true; // false once this uid signs out or another user signs in
    let running = false; // one check at a time per uid

    const run = () => {
      if (running) return;
      running = true;
      checkIsDisabled(uid)
        .then(async (status: 'disabled' | 'ok' | 'unknown') => {
          if (!active || status !== 'disabled') return; // 'ok' or 'unknown' (offline/error): stay signed in
          if (getFirebaseAuth().currentUser?.uid !== uid) return; // a different user is signed in now
          await signOut(); // onAuthStateChanged in app/_layout.tsx then shows the sign-in screen
          Alert.alert('Account disabled', 'This account has been disabled. Please contact the HabitQuest team.');
        })
        .catch((err: unknown) => console.log('Disabled-account sign-out failed', err))
        .finally(() => {
          running = false;
          mark('disabled:done');
        });
    };

    run();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [uid]);
}
