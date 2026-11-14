import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {withTimeout} from '@/services/admin';

// Account status check for every signed-in user (not just admins).
// Never throws. Returns 'disabled' ONLY when the server says users/{uid}.disabled === true
// and the user is not an admin. Offline, a timeout, any error or a missing doc is 'unknown' or 'ok',
// so nobody is ever signed out because the check couldn't run.
// The same read refreshes the greeting's name on this phone (onProfile), so that costs no extra read.
/** @returns {Promise<'disabled' | 'ok' | 'unknown'>} */
export async function checkIsDisabled(uid, onProfile) {
    return (await checkAccount(uid, onProfile)).status;
}

// The same check, also saying whether the users doc exists (the orphan-account fix): 'missing' only when the
// server answered that it doesn't; offline or any error is 'unknown', never 'missing'. No extra read for a normal
// user with a profile.
// admin: read from admins/{uid} on the server only when the profile is missing (an admin account made in the console
// has no profile and must never be sent to the recovery screen): true or false, or null when it wasn't read or the
// read failed (then nothing about the profile is acted on).
/** @returns {Promise<{status: 'disabled' | 'ok' | 'unknown', profile: 'exists' | 'missing' | 'unknown', admin: boolean | null}>} */
export async function checkAccount(uid, onProfile) {
    try {
        const {doc, getDocFromServer} = firestore();
        const db = getFirestoreDb();
        // from the server: a cached copy could still say disabled after an admin re-enabled the account
        const user = await withTimeout(getDocFromServer(doc(db, 'users', uid)));
        if (!user.exists()) {
            // no profile: is this an admin account? (one extra read, only in this case)
            try {
                const admin = await withTimeout(getDocFromServer(doc(db, 'admins', uid)));
                return {status: 'ok', profile: 'missing', admin: admin.exists()};
            } catch {
                return {status: 'ok', profile: 'missing', admin: null};
            }
        }
        if (onProfile) {
            try {
                onProfile({firstName: user.get('firstName'), lastName: user.get('lastName')});
            } catch {
                // the name refresh never affects the status check
            }
        }
        if (user.get('disabled') !== true) return {status: 'ok', profile: 'exists', admin: null};

        // admins are never signed out by this check (one extra read, only for disabled accounts)
        try {
            const admin = await withTimeout(getDocFromServer(doc(db, 'admins', uid)));
            return {status: admin.exists() ? 'ok' : 'disabled', profile: 'exists', admin: admin.exists()};
        } catch {
            return {status: 'unknown', profile: 'exists', admin: null};
        }
    } catch {
        return {status: 'unknown', profile: 'unknown', admin: null};
    }
}
