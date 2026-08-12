import {doc, setDoc} from 'firebase/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';

import {createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut} from 'firebase/auth';
import {getFirebaseAuth} from '@/services/authInit';


export async function signUp(email, password, firstName, lastName, age){

    const auth = getFirebaseAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    const uid = userCredential.user.uid;

    const db = getFirestoreDb();
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {firstName, lastName, age});
}

export async function signIn(email, password){
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
}

export async function signOut(){
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
}