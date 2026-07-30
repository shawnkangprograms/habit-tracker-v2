import { getDatabase } from '@/db/database.js';

export async function initializeSchema() {
    const db = await getDatabase();
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS habits (
            habitId INTEGER PRIMARY KEY NOT NULL,
            habitName TEXT NOT NULL,
            habitNotes TEXT
        );
        CREATE TABLE IF NOT EXISTS completions (
            completionId INTEGER PRIMARY KEY NOT NULL,
            habitId INTEGER NOT NULL,
            date TEXT NOT NULL,
            completed INTEGER NOT NULL,
            synced INTEGER NOT NULL,
            FOREIGN KEY (habitId) REFERENCES habits(habitId)
        );
    `);
    return db;
}