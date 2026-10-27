import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {getFirebaseAuth} from '@/services/authInit';
import {getSyncStatus} from '@/sync/syncEngine';
import {createStarterIdeasLoader} from '@/utils/starterIdeas';

// Starter ideas for the New habit screen, from the admin-managed "catalog" collection, with three built-in
// starters when the catalog is unavailable or empty (utils/starterIdeas.ts). Best effort, never throws.

const FETCH_LIMIT = 50; // headroom so a few invalid docs can't leave fewer than the number shown

export const getStarterIdeas = createStarterIdeasLoader({
    isSignedIn: () => !!getFirebaseAuth().currentUser,
    // read-only use of the sync status: if the last cycle found the phone offline, don't wait 5 s for Firestore
    isOffline: () => getSyncStatus().state === 'offline',
    fetchCatalog: async () => {
        const {collection, getDocs, limit, orderBy, query} = firestore();
        const q = query(collection(getFirestoreDb(), 'catalog'), orderBy('name'), limit(FETCH_LIMIT));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({id: d.id, data: d.data()}));
    },
});
