import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {getFirebaseAuth} from '@/services/authInit';
import {bumpAdminDataVersion, codedError, isNetworkError, withTimeout} from '@/services/admin';

// Admin catalog of starter habits. Online only: reads come from the server, and every write
// checks the server first so nothing is queued offline to land later without the admin knowing.

export const CATALOG_LIMIT = 200;
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // days are stored Mon to Sun for stable display

function toItem(d) {
    const data = d.data();
    return {
        id: d.id,
        name: typeof data.name === 'string' ? data.name : '',
        icon: data.icon,
        frequency: data.frequency,
        reminderTime: typeof data.reminderTime === 'string' ? data.reminderTime : null,
    };
}

// validated HabitInput (from validateHabitInput) -> catalog document fields
function toFields(input) {
    const frequency = input.frequency.type === 'weekdays'
        ? {type: 'weekdays', days: DAY_ORDER.filter((d) => input.frequency.days.includes(d))}
        : {type: 'daily'};
    return {name: input.habitName, icon: input.icon, frequency, reminderTime: input.reminderTime};
}

function requireAdminUid() {
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) throw codedError('unauthenticated', 'Not signed in');
    return uid;
}

// A server read before writing: offline fails here, before anything is queued
async function checkServer(ref, mustExist) {
    const {getDocFromServer} = firestore();
    const snap = await withTimeout(getDocFromServer(ref));
    if (mustExist && !snap.exists()) throw codedError('not-found', 'Catalog item not found');
}

// Adds the adminLog entry to the same batch, so the change and its log land together or not at all
async function commitWithLog(db, batch, adminUid, log) {
    const {collection, doc, serverTimestamp} = firestore();
    batch.set(doc(collection(db, 'adminLog')), {...log, adminUid, at: serverTimestamp()});
    try {
        // the write was sent; a timeout here means it is queued and may still finish once back online
        await withTimeout(batch.commit(), 'commit-unconfirmed');
    } finally {
        bumpAdminDataVersion(); // reload lists on focus even if unconfirmed, so a late write shows up
    }
}

// All items (up to CATALOG_LIMIT), sorted by name ignoring case
export async function getCatalogItems() {
    const {collection, getDocsFromServer, limit, orderBy, query} = firestore();
    const q = query(collection(getFirestoreDb(), 'catalog'), orderBy('name'), limit(CATALOG_LIMIT));
    const snap = await withTimeout(getDocsFromServer(q));
    return snap.docs.map(toItem).sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
}

// One item, or null if it no longer exists
export async function getCatalogItem(id) {
    const {doc, getDocFromServer} = firestore();
    const snap = await withTimeout(getDocFromServer(doc(getFirestoreDb(), 'catalog', id)));
    return snap.exists() ? toItem(snap) : null;
}

export async function createCatalogItem(input) {
    const {collection, doc, serverTimestamp, writeBatch} = firestore();
    const db = getFirestoreDb();
    const adminUid = requireAdminUid();
    await checkServer(doc(db, 'admins', adminUid), false); // own admins doc: readable, and proves we're online

    const ref = doc(collection(db, 'catalog'));
    const batch = writeBatch(db);
    batch.set(ref, {...toFields(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
    await commitWithLog(db, batch, adminUid, {action: 'create', targetType: 'catalog', targetId: ref.id, targetName: input.habitName});
}

export async function updateCatalogItem(id, input) {
    const {doc, serverTimestamp, writeBatch} = firestore();
    const db = getFirestoreDb();
    const adminUid = requireAdminUid();
    const ref = doc(db, 'catalog', id);
    await checkServer(ref, true);

    const batch = writeBatch(db);
    batch.update(ref, {...toFields(input), updatedAt: serverTimestamp()});
    await commitWithLog(db, batch, adminUid, {action: 'update', targetType: 'catalog', targetId: id, targetName: input.habitName});
}

// Hard delete; the log entry keeps the item's name
export async function deleteCatalogItem(id, name) {
    const {doc, writeBatch} = firestore();
    const db = getFirestoreDb();
    const adminUid = requireAdminUid();
    const ref = doc(db, 'catalog', id);
    await checkServer(ref, true);

    const batch = writeBatch(db);
    batch.delete(ref);
    await commitWithLog(db, batch, adminUid, {action: 'delete', targetType: 'catalog', targetId: id, targetName: name});
}

// Friendly message for a failed catalog write
export function describeCatalogWriteError(err) {
    if (err?.code === 'commit-unconfirmed') return "Couldn't confirm the save. It will finish when you're back online.";
    if (isNetworkError(err)) return "You're offline. Changes need an internet connection.";
    if (err?.code === 'permission-denied') return "You don't have permission to change the catalog.";
    if (err?.code === 'not-found') return 'This item no longer exists.';
    return 'Something went wrong. Please try again.';
}
