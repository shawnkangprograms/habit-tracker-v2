import {initializeApp, getApps, getApp} from 'firebase/app';
//initalizeApp: creates the firebase app 
//getApps/getApp: check if it already exists (avoids creating it twice)

import {initializeAuth, getReactNativePersistence} from 'firebase/auth';
//initializeAuth: sets up Auth with custom options
//getReatNativePersistence: tells Auth to use device storage to remember login

import AsyncStorage from '@react-native-async-storage/async-storage';
//the storage mechanism Auth will use to persist the session on device

import {firebaseConfig} from './firebaseConfig';
//the existing config object

let authConnection = null;
//cached Auth instance, same pattern as getDatabase()/getFirestoreDb()

export function getFirebaseAuth(){
//named export, non-async (same reasoning as getFirestore - no waiting happens here)    

if (!authConnection){
    //only set up once; reuse afterwards

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    //if no Firebase app exists yet, create one; otherwise reuse the existing one (prevents a 'already initialized' crash)

    authConnection = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
        //tell Auth to persist login sessions using AsyncStorage, so the user stays logged in across app restarts
    });
}

return authConnection;
//hand back the cached Auth instance
}