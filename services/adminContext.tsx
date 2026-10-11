import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {checkIsAdmin} from '@/services/admin';

type AdminCheck = {state: 'admin' | 'not-admin' | 'failed'; retryable: boolean};

type AdminContextValue = {
  isAdmin: boolean;
  recheckIfFailed: () => void; // re-runs the check only after a network failure
};

export const AdminContext = createContext<AdminContextValue>({isAdmin: false, recheckIfFailed: () => {}});

export function useIsAdmin() {
  return useContext(AdminContext);
}

// Runs the admin check for the signed-in uid. Called in app/_layout.tsx, but it never gates rendering:
// isAdmin starts false and fills in when the check returns. Kept in memory only, keyed by uid.
export function useAdminCheck(uid: string | null): AdminContextValue {
  const [result, setResult] = useState<{uid: string; check: AdminCheck} | null>(null);
  const currentUid = useRef(uid); // the uid a returning check must still match to be applied
  const inFlightUid = useRef<string | null>(null); // avoids starting a second check for the same uid

  const run = useCallback((forUid: string) => {
    inFlightUid.current = forUid;
    checkIsAdmin(forUid).then((check: AdminCheck) => {
      if (currentUid.current === forUid) setResult({uid: forUid, check}); // drop results for a user who already signed out
      if (inFlightUid.current === forUid) inFlightUid.current = null;
    });
  }, []);

  useEffect(() => { // every sign-in (or launch with a saved session) gets a fresh check; sign-out clears it
    currentUid.current = uid;
    if (uid) run(uid);
    else inFlightUid.current = null;
  }, [uid, run]);

  const check = result && result.uid === uid ? result.check : null; // a previous user's result never counts
  const isAdmin = check?.state === 'admin';

  const recheckIfFailed = useCallback(() => {
    if (uid && check?.state === 'failed' && check.retryable && inFlightUid.current !== uid) run(uid);
  }, [uid, check, run]);

  return useMemo(() => ({isAdmin, recheckIfFailed}), [isAdmin, recheckIfFailed]);
}
