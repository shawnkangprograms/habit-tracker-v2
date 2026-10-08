import * as SQLite from 'expo-sqlite';
import {migrateDbIfNeeded} from '@/db/schema';

// Cache the promise (not the connection) so two early callers can't open the database twice,
// and so no query can run before the migration has finished.
let dbPromise = null;

async function openAndMigrate() {
    const db = await SQLite.openDatabaseAsync('habit.db');

    // Foreign keys are off by default and must be enabled on every connection, outside a transaction.
    await db.execAsync('PRAGMA foreign_keys = ON');
    const fk = await db.getFirstAsync('PRAGMA foreign_keys');
    if (fk?.foreign_keys !== 1) {
        throw new Error('Could not enable foreign keys on the local database');
    }

    await migrateDbIfNeeded(db);
    return db;
}

export function getDatabase() {
    if (!dbPromise) {
        dbPromise = openAndMigrate().catch((err) => {
            dbPromise = null; // allow a retry
            throw err;
        });
    }
    return dbPromise;
}
