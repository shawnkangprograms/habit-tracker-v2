import {
    collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, serverTimestamp, startAfter,
    Timestamp, writeBatch,
} from 'firebase/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';

// The Firestore side of the sync engine (sync/engineCore.ts). The only sync file that imports Firestore.
// Docs carry exactly the fields the rules allow; no userId (the uid is in the path). Whole-doc set(),
// never merge: the rules check the complete field set on every write.
// JS integers (createdAt, updatedAt, completed 0/1) are stored as Firestore integers by the SDK
// (safe integers are encoded as integerValue), which the rules' "is int" checks require.

// Keeps a Firestore error's code (classifyError needs it); never includes user data in the message
function rethrowWithCode(err) {
    const code = typeof err?.code === 'string' ? err.code : 'unknown';
    const wrapped = new Error(`Firestore request failed (${code})`);
    wrapped.code = code;
    throw wrapped;
}

// Is Firestore reachable for this user? A server read of their own users doc. A missing doc is fine
// (the read still succeeded); only a thrown error (offline, timeout, rules) counts as unreachable.
async function probe(uid) {
    try {
        await getDocFromServer(doc(getFirestoreDb(), 'users', uid));
    } catch (err) {
        rethrowWithCode(err);
    }
}

// One batch: users/{uid}/habits/{habitId}
async function writeHabits(uid, items) {
    const db = getFirestoreDb();
    const batch = writeBatch(db);
    for (const {habitId, doc: d} of items) {
        batch.set(doc(db, 'users', uid, 'habits', habitId), {
            habitName: d.habitName,
            icon: d.icon,
            frequencyType: d.frequencyType,
            days: d.days,
            reminderTime: d.reminderTime,
            source: d.source,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            deleted: d.deleted,
            serverUpdatedAt: serverTimestamp(),
        });
    }
    try {
        await batch.commit();
    } catch (err) {
        rethrowWithCode(err);
    }
}

// One batch: users/{uid}/completions/{habitId}_{date}
async function writeCompletions(uid, items) {
    const db = getFirestoreDb();
    const batch = writeBatch(db);
    for (const {docId, doc: d} of items) {
        batch.set(doc(db, 'users', uid, 'completions', docId), {
            habitId: d.habitId,
            date: d.date,
            completed: d.completed,
            updatedAt: d.updatedAt,
            serverUpdatedAt: serverTimestamp(),
        });
    }
    try {
        await batch.commit();
    } catch (err) {
        rethrowWithCode(err);
    }
}

// One page of users/{uid}/{habits|completions}, ordered by (serverUpdatedAt, doc id), after a cursor.
// From the server only (never the SDK cache). The automatic single-field index on serverUpdatedAt serves
// this query (doc id is the implicit last order), so no composite index is needed.
// KNOWN, VERY SMALL RACE: a doc committed with a serverUpdatedAt slightly earlier than a cursor this phone
// already moved past is never pulled here; see sync/cursorStore.ts for the recovery options.
async function pullPage(uid, collectionName, after, pageSize) {
    const constraints = [orderBy('serverUpdatedAt'), orderBy(documentId())];
    if (after) constraints.push(startAfter(new Timestamp(after.seconds, after.nanoseconds), after.docId));
    constraints.push(limit(pageSize));

    let snapshot;
    try {
        snapshot = await getDocsFromServer(query(collection(getFirestoreDb(), 'users', uid, collectionName), ...constraints));
    } catch (err) {
        rethrowWithCode(err);
    }

    return {
        docs: snapshot.docs.map((d) => {
            const {serverUpdatedAt, ...data} = d.data();
            return {
                id: d.id,
                data,
                cursor: {seconds: serverUpdatedAt.seconds, nanoseconds: serverUpdatedAt.nanoseconds, docId: d.id},
            };
        }),
    };
}

export const firestoreRemote = {probe, writeHabits, writeCompletions, pullPage};
