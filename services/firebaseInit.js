import {getFirestore} from 'firebase/firestore';
import {initializeApp} from 'firebase/app';
import {firebaseConfig} from './firebaseConfig';

let connection = null;

export function getFirestoreDb() {
    if (!connection) {
        const app = initializeApp(firebaseConfig);
        connection = getFirestore(app);
    }
    return connection;
}