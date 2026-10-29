import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';

import {
    createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut,
} from 'firebase/auth';
import {getFirebaseAuth} from '@/services/authInit';
import {endSession} from '@/services/authMarker';
// Every sign-out goes through endSession (clears the sign-in marker first); tests/auth-session.test.ts checks
// that nothing else in the app calls Firebase's signOut or deletes the user.


export async function signUp(email, password, age){

    const auth = getFirebaseAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    const uid = userCredential.user.uid;

    const {doc, serverTimestamp, setDoc} = firestore();
    const db = getFirestoreDb();
    const userDocRef = doc(db, 'users', uid);
    try {
        await setDoc(userDocRef, {age, createdAt: serverTimestamp()});
    } catch (cause) {
        // roll back: no account may exist without its users doc (age). The sign-in is seconds old, so no reauth is needed.
        // Deleting also signs out, so it goes through endSession; it goes ahead even if the marker can't be cleared.
        await endSession(() => userCredential.user.delete(), {proceedIfMarkerClearFails: true}).catch(() => {});
        const err = new Error('Could not create the user profile');
        err.code = 'profile-write-failed';
        err.cause = cause;
        throw err;
    }
}

export async function signIn(email, password){
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
}

// Never reveals whether the email is registered: user-not-found counts as sent.
// (Projects with email-enumeration protection never return that code anyway.)
export async function resetPassword(email){
    const auth = getFirebaseAuth();
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (err) {
        if (err?.code === 'auth/user-not-found') return;
        throw err;
    }
}

// Throws (and stays signed in) if the sign-in marker can't be cleared, so the next launch never presumes this account
export async function signOut(){
    const auth = getFirebaseAuth();
    await endSession(() => firebaseSignOut(auth));
}