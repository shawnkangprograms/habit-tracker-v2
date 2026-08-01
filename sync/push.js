import {getFirestoreDb} from '@/services/firebaseInit';
import {doc, getDoc, setDoc} from 'firebase/firestore';

export async function pushCompletion(localRow) { //localRow = one row from the phone's SQLite completions table 
    const db = getFirestoreDb(); //get (or create) the Firestore connection
    const docRef = doc(db, 'completions', `${localRow.habitId}_${localRow.date}`);
    //build a reference to one specific firestore document, uniquely identified by habitId + date
    
    const remoteSnap = await getDoc(docRef); //fetch whatever is currently at that document path (acync real ntw call)
    const remoteData = remoteSnap.exists() ? remoteSnap.data() : null;
    //if a doc already exists, there, grab its data; otherwise there's nothing to compare against yet 

    const finalCompleted = remoteData
        ? (remoteData.completed || localRow.completed) // sticky true: if remote is already true, keep true; else use local's value
        : localRow.completed; // no remote doc yet, so just use whatever local says

    await setDoc(docRef, {
        habitId: localRow.habitId, // store which habit this belongs to
        date: localRow.date, // store which day this completion is for
        completed: finalCompleted, // store the resolved (sticky-true) value
    }); // write the resolved data to Firestore (async: real ntw call)

    return finalCompleted; // hand back the resolved value, so the caller can update SQLite too
}