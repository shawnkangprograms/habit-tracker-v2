import {
    collection, doc, getCountFromServer, getDoc, getDocFromServer, getDocsFromServer, limit, query, serverTimestamp, where,
    writeBatch,
} from 'firebase/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {getFirebaseAuth} from '@/services/authInit';

// Admin reads. Every call needs the network; the rules are the real guard, the UI only hides things.
// Lists use the *FromServer reads: plain getDocs can quietly return cached data while offline.

export const USERS_LIMIT = 100; // the Users screen shows at most this many, in document-id order
const TIMEOUT_MS = 15000; // offline Firestore calls can hang; give up and show the offline panel instead

const NETWORK_CODES = ['unavailable', 'deadline-exceeded'];

export function isNetworkError(err) {
    return NETWORK_CODES.includes(err?.code);
}

// Error with a Firestore-style code, so every caller can branch on err.code
export function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// rejects with `code` (a network-style error by default) if the request takes too long
export function withTimeout(promise, code = 'deadline-exceeded') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(codedError(code, 'Request timed out')), TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Bumped after every admin write. List screens reload on focus only when it has changed since their last load.
let adminDataVersion = 0;

export function getAdminDataVersion() {
    return adminDataVersion;
}

export function bumpAdminDataVersion() {
    adminDataVersion += 1;
}

// Never throws. 'failed' only for network problems (retryable).
// permission-denied, a missing doc or any other error is a final 'not-admin'.
/** @returns {Promise<{state: 'admin' | 'not-admin' | 'failed', retryable: boolean}>} */
export async function checkIsAdmin(uid) {
    try {
        const snap = await withTimeout(getDoc(doc(getFirestoreDb(), 'admins', uid)));
        return {state: snap.exists() ? 'admin' : 'not-admin', retryable: false};
    } catch (err) {
        if (isNetworkError(err)) return {state: 'failed', retryable: true};
        console.log('Admin check failed', err?.code ?? err);
        return {state: 'not-admin', retryable: false};
    }
}

// Overview counts via aggregation queries, so no user documents are downloaded.
// Users with no numeric age (or one outside the buckets' range) land in noAge.
export async function getAdminOverview() {
    const db = getFirestoreDb();
    const users = collection(db, 'users');
    const count = async (q) => (await getCountFromServer(q)).data().count;

    const [total, age18to24, age25to34, age35plus, disabledUsers, catalogItems, auditEntries] = await withTimeout(Promise.all([
        count(users),
        count(query(users, where('age', '>=', 18), where('age', '<', 25))),
        count(query(users, where('age', '>=', 25), where('age', '<', 35))),
        count(query(users, where('age', '>=', 35))),
        count(query(users, where('disabled', '==', true))),
        count(collection(db, 'catalog')),
        count(collection(db, 'adminLog')),
    ]));

    return {
        total,
        age18to24,
        age25to34,
        age35plus,
        noAge: Math.max(0, total - age18to24 - age25to34 - age35plus),
        disabledUsers,
        catalogItems,
        auditEntries,
    };
}

// users doc -> {uid, age, disabled}. Only these fields are used; no emails are stored in users docs.
function toAdminUser(d) {
    const age = d.get('age');
    return {uid: d.id, age: typeof age === 'number' ? age : null, disabled: d.get('disabled') === true};
}

// First USERS_LIMIT users, in document-id order
export async function getAdminUsers() {
    const snap = await withTimeout(getDocsFromServer(query(collection(getFirestoreDb(), 'users'), limit(USERS_LIMIT))));
    return snap.docs.map(toAdminUser);
}

// One user, or null if the users doc doesn't exist
export async function getAdminUser(uid) {
    const snap = await withTimeout(getDocFromServer(doc(getFirestoreDb(), 'users', uid)));
    return snap.exists() ? toAdminUser(snap) : null;
}

// Sets users/{uid}.disabled and writes the adminLog entry in one batch.
// Online only: a server read first, so nothing is queued offline. The rules allow admins to change
// only this field, and never on themselves; the UI hides the button for the admin's own uid.
export async function setUserDisabled(uid, disabled) {
    const db = getFirestoreDb();
    const adminUid = getFirebaseAuth().currentUser?.uid;
    if (!adminUid) throw codedError('unauthenticated', 'Not signed in');
    if (adminUid === uid) throw codedError('permission-denied', "Admins can't change their own status");

    const ref = doc(db, 'users', uid);
    const snap = await withTimeout(getDocFromServer(ref));
    if (!snap.exists()) throw codedError('not-found', 'User not found');

    const batch = writeBatch(db);
    batch.update(ref, {disabled});
    batch.set(doc(collection(db, 'adminLog')), {
        adminUid,
        action: disabled ? 'disable' : 'enable',
        targetType: 'user',
        targetId: uid,
        targetName: uid.slice(0, 8), // short uid; never an email
        at: serverTimestamp(),
    });
    try {
        // the write was sent; a timeout here means it is queued and may still finish once back online
        await withTimeout(batch.commit(), 'commit-unconfirmed');
    } finally {
        bumpAdminDataVersion(); // Users list and Overview reload on return
    }
}

// Friendly message for a failed Disable/Enable
export function describeUserWriteError(err) {
    if (err?.code === 'commit-unconfirmed') return "Couldn't confirm the change. It will finish when you're back online.";
    if (isNetworkError(err)) return "You're offline. Changes need an internet connection.";
    if (err?.code === 'permission-denied') return "You don't have permission to change this user.";
    if (err?.code === 'not-found') return 'This user no longer exists.';
    return 'Something went wrong. Please try again.';
}

// Friendly message for the admin screens' error panel
/** @returns {{kind: 'offline' | 'denied' | 'error', message: string}} */
export function describeAdminError(err) {
    if (isNetworkError(err)) {
        return {kind: 'offline', message: "You're offline. Admin tools need an internet connection."};
    }
    if (err?.code === 'permission-denied') {
        return {kind: 'denied', message: "You don't have access to admin data."};
    }
    return {kind: 'error', message: 'Something went wrong loading admin data.'};
}
