import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {withTimeout} from '@/services/admin';

// Account status check for every signed-in user (not just admins).
// Never throws. Returns 'disabled' ONLY when the server says users/{uid}.disabled === true
// and the user is not an admin. Offline, a timeout, any error or a missing doc is 'unknown' or 'ok',
// so nobody is ever signed out because the check couldn't run.
/** @returns {Promise<'disabled' | 'ok' | 'unknown'>} */
export async function checkIsDisabled(uid) {
    try {
        const {doc, getDocFromServer} = firestore();
        const db = getFirestoreDb();
        // from the server: a cached copy could still say disabled after an admin re-enabled the account
        const user = await withTimeout(getDocFromServer(doc(db, 'users', uid)));
        if (!user.exists() || user.get('disabled') !== true) return 'ok';

        // admins are never signed out by this check (one extra read, only for disabled accounts)
        const admin = await withTimeout(getDocFromServer(doc(db, 'admins', uid)));
        return admin.exists() ? 'ok' : 'disabled';
    } catch {
        return 'unknown';
    }
}
