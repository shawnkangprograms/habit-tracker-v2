// Versioned migrations, tracked with PRAGMA user_version (pattern from the Expo SDK 57 expo-sqlite docs).
// To change the schema later: append a new `if (version < N)` step. Never edit an earlier step.
// Each step runs in ONE transaction together with its user_version bump: if any statement fails, SQLite rolls
// the whole step back (ALTER TABLE and PRAGMA user_version are transactional), the version stays where it
// was, migrateDbIfNeeded rejects, and getDatabase() never hands out the connection (the app shows its
// "Couldn't open local data" screen; the next launch retries the same step).

export const DATABASE_VERSION = 2;

// v2: per-habit alarm sound and reminder lead time. Existing rows get 0 (alarm off, remind at the time).
const ADD_ALARM_AND_LEAD_V2 = `
    ALTER TABLE habits ADD COLUMN alarm INTEGER NOT NULL DEFAULT 0 CHECK (alarm IN (0, 1));
    ALTER TABLE habits ADD COLUMN remindBeforeMin INTEGER NOT NULL DEFAULT 0
        CHECK (remindBeforeMin IN (0, 5, 10, 15, 30, 60));
`;

const CREATE_TABLES_V1 = `
    CREATE TABLE habits (
        habitId       TEXT    PRIMARY KEY NOT NULL,
        userId        TEXT    NOT NULL CHECK (length(userId) > 0),
        habitName     TEXT    NOT NULL CHECK (length(habitName) BETWEEN 1 AND 30),
        icon          TEXT    NOT NULL,
        frequencyType TEXT    NOT NULL CHECK (frequencyType IN ('daily', 'weekdays')),
        reminderTime  TEXT,
        source        TEXT    NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai_suggested')),
        createdAt     INTEGER NOT NULL,
        updatedAt     INTEGER NOT NULL,
        deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
        synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    );
    CREATE TABLE habitDays (
        habitId TEXT NOT NULL REFERENCES habits(habitId),
        day     TEXT NOT NULL CHECK (day IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
        PRIMARY KEY (habitId, day)
    );
    CREATE TABLE completions (
        habitId   TEXT    NOT NULL REFERENCES habits(habitId),
        date      TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        updatedAt INTEGER NOT NULL DEFAULT 0,
        synced    INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
        PRIMARY KEY (habitId, date)
    );
`;

async function getColumns(db, table) {
    return db.getAllAsync(`PRAGMA table_info(${table})`); // table name is a constant, never user input
}

// The pre-migration schema: habits(habitId INTEGER, habitName, habitNotes), completions(completionId, ...).
async function hasLegacyMarkers(db, existingTables) {
    if (existingTables.includes('habits')) {
        const cols = await getColumns(db, 'habits');
        if (cols.some((c) => c.name === 'habitNotes')) return true;
        if (cols.some((c) => c.name === 'habitId' && c.type.toUpperCase() === 'INTEGER')) return true;
    }
    if (existingTables.includes('completions')) {
        const cols = await getColumns(db, 'completions');
        if (cols.some((c) => c.name === 'completionId')) return true;
    }
    return false;
}

// `targetVersion` is for tests only (to build an older schema and migrate it); the app always passes nothing.
export async function migrateDbIfNeeded(db, targetVersion = DATABASE_VERSION) {
    const result = await db.getFirstAsync('PRAGMA user_version');
    const version = result?.user_version ?? 0;
    if (version >= targetVersion) return;

    if (version < 1) {
        await db.withTransactionAsync(async () => {
            const tables = await db.getAllAsync(
                `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('habits', 'habitDays', 'completions')`
            );
            const existingTables = tables.map((t) => t.name);

            if (existingTables.length > 0) {
                if (!(await hasLegacyMarkers(db, existingTables))) {
                    throw new Error('Unrecognised local database (version 0)');
                }
                // One-time wipe of the legacy local tables (test data only, approved). Children first.
                await db.execAsync(`
                    DROP TABLE IF EXISTS completions;
                    DROP TABLE IF EXISTS habitDays;
                    DROP TABLE IF EXISTS habits;
                `);
                console.log('Legacy local database wiped (test data)');
            }

            await db.execAsync(CREATE_TABLES_V1);
            await db.execAsync('PRAGMA user_version = 1');
        });
    }

    if (version < 2 && targetVersion >= 2) {
        await db.withTransactionAsync(async () => {
            await db.execAsync(ADD_ALARM_AND_LEAD_V2);
            await db.execAsync('PRAGMA user_version = 2');
        });
        console.log('Local database migrated to v2 (alarm, remindBeforeMin)');
    }

    const after = await db.getFirstAsync('PRAGMA user_version');
    console.log('Local database at user_version', after?.user_version);
}
