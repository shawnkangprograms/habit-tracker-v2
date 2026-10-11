import {collection, getDocs, limit, orderBy, query} from 'firebase/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {getFirebaseAuth} from '@/services/authInit';
import {validateHabitInput} from '@/validation/validators';

// Starter ideas for the New habit screen, from the admin-managed "catalog" collection.
// Best effort: any failure (offline, timeout, permission) returns [] and the form works as before.

const FETCH_LIMIT = 50; // headroom so a few invalid docs can't leave fewer than SHOW_LIMIT
const SHOW_LIMIT = 12;
const TIMEOUT_MS = 5000;

// Resolves to null if the read takes too long; the read itself is not cancelled, its result is ignored
function withTimeout(promise) {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Never throws. Returns up to SHOW_LIMIT valid ideas {id, habitName, icon, frequency, reminderTime}, sorted by name.
export async function getStarterIdeas() {
    try {
        if (!getFirebaseAuth().currentUser) return []; // the rules only allow signed-in reads

        const q = query(collection(getFirestoreDb(), 'catalog'), orderBy('name'), limit(FETCH_LIMIT));
        const snap = await withTimeout(getDocs(q));
        if (!snap) return [];

        const ideas = [];
        for (const d of snap.docs) {
            const data = d.data();
            // same validators and allowed icon list as the form; invalid docs are skipped
            const result = validateHabitInput({
                habitName: data.name,
                icon: data.icon,
                frequency: data.frequency,
                reminderTime: data.reminderTime ?? null,
            });
            if (result.valid) ideas.push({id: d.id, ...result.value});
        }

        return ideas
            .sort((a, b) => a.habitName.localeCompare(b.habitName, undefined, {sensitivity: 'base'}))
            .slice(0, SHOW_LIMIT);
    } catch {
        return [];
    }
}
