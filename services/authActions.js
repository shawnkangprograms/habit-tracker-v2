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
import {profileCompletion} from '@/services/profileCompletion';
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
    // The orphan-account fix (docs/HABITQUEST_DESIGN.md): the profile is completed, never rolled back. Its details go
    // on this phone first, before anything else, so a kill or a failed write from here on is finished later by the
    // completer (services/profileCompletionCore.ts); the account is never deleted.
    const profile = {age, firstName: name.firstName, lastName: name.lastName};
    await profileCompletion.savePending(uid, profile);// never throws
    // Onboarding opens on its own only after a sign-up on this phone (utils/onboarding/gate.ts). Set before the
    // profile write, because the auth listener can mount Home before setDoc returns. Local only; a failed save
    // just means it doesn't open on its own (Settings still has it).
    await onboardingStore.markPending(uid).catch(() => {});
    // the greeting's copy, so Home has the name on its first render after onboarding (never throws)
    await profileNameStore.set({uid, firstName: name.firstName, lastName: name.lastName});

    // One try now, at most 10 s. If it isn't confirmed (offline, a timeout, a refusal), sign-up still succeeds: the
    // details stay pending and the completer writes them on the next sign-in, launch, foreground or sync cycle, or
    // the recovery screen asks for them (app/profile-setup.tsx).
    await profileCompletion.writeNow(uid, profile);
    // the doc (or the pending copy) and the phone's copy hold the name; saving it in Settings sets displayName again
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