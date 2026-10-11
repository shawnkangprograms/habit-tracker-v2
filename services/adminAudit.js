import {collection, getDocsFromServer, limit, orderBy, query} from 'firebase/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {withTimeout} from '@/services/admin';

// Admin audit log reads: the newest entries first, from the server only.
// Entries are written by the admin services in the same batch as each change.

const str = (value) => (typeof value === 'string' ? value : '');

// Latest `count` entries: {id, adminUid, action, targetType, targetId, targetName, at (Date or null)}
export async function getAuditEntries(count) {
    const q = query(collection(getFirestoreDb(), 'adminLog'), orderBy('at', 'desc'), limit(count));
    const snap = await withTimeout(getDocsFromServer(q));
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            adminUid: str(data.adminUid),
            action: str(data.action),
            targetType: str(data.targetType),
            targetId: str(data.targetId),
            targetName: str(data.targetName),
            at: typeof data.at?.toDate === 'function' ? data.at.toDate() : null,
        };
    });
}
