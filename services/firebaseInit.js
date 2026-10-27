import {initializeApp, getApps, getApp} from 'firebase/app';
import {firestore} from '@/services/firestore';
import {firebaseConfig} from './firebaseConfig';

let connection = null;

export function getFirestoreDb() {
    if (!connection) {
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        // check if an app already exists (maybe created by authInit.js) before creating a new one
        connection = firestore().getFirestore(app);
    }
    return connection;
}
