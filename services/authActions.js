import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';

import {
    createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut,
    updateProfile,
} from 'firebase/auth';
import {getFirebaseAuth} from '@/services/authInit';
import {endSession} from '@/services/authMarker';
import {onboardingStore} from '@/services/onboardingStore';
import {onboardingLaunch} from '@/services/onboardingLaunch';
import {profileNameStore} from '@/services/profileName';
import {codedError, withTimeout} from '@/services/admin';
// Every sign-out goes through endSession (clears the sign-in marker first); tests/auth-session.test.ts checks
// that nothing else in the app calls Firebase's signOut or deletes the user.
//
// Names (docs/HABITQUEST_DESIGN.md): firstName and lastName on the user's own users/{uid} doc, Auth displayName
// "First Last", and a copy on this phone for the greeting (services/profileName.ts). Used only for the greeting;
// never sent to the insight function and never shown in the admin screens.

const displayNameOf = (name) => `${name.firstName} ${name.lastName}`;

// name: {firstName, lastName}, already validated (validatePersonName)
export async function signUp(email, password, age, name){

    const auth = getFirebaseAuth();
    // Home opens onboarding straight away instead of showing itself first (services/onboardingLaunch.ts). Set
    // before the account exists: the auth listener swaps in the tabs before createUserWithEmailAndPassword returns.
    onboardingLaunch.beginSignUp();
    let userCredential;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        onboardingLaunch.cancelSignUp();
        throw err;
    }

    const uid = userCredential.user.uid;
    // Onboarding opens on its own only after a sign-up on this phone (utils/onboarding/gate.ts). Set before the
    // profile write, because the auth listener can mount Home before setDoc returns. Local only; a failed save
    // just means it doesn't open on its own (Settings still has it).
    await onboardingStore.markPending(uid).catch(() => {});
    // the greeting's copy, so Home has the name on its first render after onboarding (never throws)
    await profileNameStore.set({uid, firstName: name.firstName, lastName: name.lastName});

    const {doc, serverTimestamp, setDoc} = firestore();
    const db = getFirestoreDb();
    const userDocRef = doc(db, 'users', uid);
    try {
        await setDoc(userDocRef, {age, firstName: name.firstName, lastName: name.lastName, createdAt: serverTimestamp()});
    } catch (cause) {
        // roll back: no account may exist without its users doc (age). The sign-in is seconds old, so no reauth is needed.
        // Deleting also signs out, so it goes through endSession; it goes ahead even if the marker can't be cleared.
        await endSession(() => userCredential.user.delete(), {proceedIfMarkerClearFails: true}).catch(() => {});
        await onboardingStore.clearPending(uid).catch(() => {});
        await profileNameStore.clear(uid);
        onboardingLaunch.cancelSignUp();// onboarding, if already open, closes itself once no one is signed in
        const err = new Error('Could not create the user profile');
        err.code = 'profile-write-failed';
        err.cause = cause;
        throw err;
    }
    // Not part of the rollback: the doc and the phone's copy already hold the name, and saving it in Settings sets
    // displayName again
    await updateProfile(userCredential.user, {displayName: displayNameOf(name)})
        .catch((err) => console.log('Setting the display name failed', err?.code));
}

// Settings > Your name. Online only, like the admin writes: a server read first, so nothing is queued offline and
// a failure changes nothing anywhere. name: {firstName, lastName}, already validated.
export async function saveName(name){
    const user = getFirebaseAuth().currentUser;
    if (!user) throw codedError('unauthenticated', 'Not signed in');
    const {doc, getDocFromServer, updateDoc} = firestore();
    const ref = doc(getFirestoreDb(), 'users', user.uid);
    const snap = await withTimeout(getDocFromServer(ref));
    if (!snap.exists()) throw codedError('not-found', 'Profile not found');
    await withTimeout(updateDoc(ref, {firstName: name.firstName, lastName: name.lastName}), 'commit-unconfirmed');
    // the doc is saved: from here the name counts as saved. displayName is secondary (the greeting reads the doc's
    // name first), so its failure is logged, not shown.
    await profileNameStore.set({uid: user.uid, firstName: name.firstName, lastName: name.lastName});
    await withTimeout(updateProfile(user, {displayName: displayNameOf(name)}))
        .catch((err) => console.log('Setting the display name failed', err?.code));
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