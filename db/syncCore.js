import {mergeHabit} from '@/sync/merge';

// SQLite side of sync. Every function takes the database and the uid explicitly (never the signed-in user)
// and filters through habits.userId. The db is anything with getAllAsync / getFirstAsync / runAsync /
// withTransactionAsync: the app passes the expo-sqlite connection (db/sync.js), the tests a node:sqlite adapter.
// No expo imports here, so Node's test runner can load this file.

function requireUid(uid) {
    if (typeof uid !== 'string' || uid.length === 0) throw new Error('A user id is required.');
}

const HABIT_COLUMNS = 'habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced';

// habits row (+ its habitDays) -> LocalHabit (sync/merge.ts). No userId: it never travels.
function toLocalHabit(row, days) {
    return {
        habitId: row.habitId,
        habitName: row.habitName,
        icon: row.icon,
        frequencyType: row.frequencyType,
        days: row.frequencyType === 'weekdays' ? days : [],
        reminderTime: row.reminderTime,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deleted: row.deleted === 1,
    };
}

// Only the LocalHabit fields, so nothing else on the input object (e.g. a userId) can reach SQLite
function pickHabit(h) {
    return {
        habitId: h.habitId,
        habitName: h.habitName,
        icon: h.icon,
        frequencyType: h.frequencyType,
        days: h.frequencyType === 'weekdays' ? [...h.days] : [],
        reminderTime: h.reminderTime,
        source: h.source,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
        deleted: h.deleted,
    };
}

// ---------- Push side ----------

// This uid's unsynced habits with their days, tombstones included.
// Two reads, not one transaction: if the habit changes in between, its updatedAt changes too,
// so markHabitSynced refuses and the habit is pushed again next cycle.
export async function getDirtyHabits(db, uid) {
    requireUid(uid);
    const rows = await db.getAllAsync(
        `SELECT ${HABIT_COLUMNS} FROM habits WHERE userId = ? AND synced = 0 ORDER BY createdAt`,
        [uid]
    );
    if (rows.length === 0) return [];

    const dayRows = await db.getAllAsync(
        `SELECT d.habitId, d.day FROM habitDays d
        JOIN habits h ON h.habitId = d.habitId
        WHERE h.userId = ? AND h.synced = 0`,
        [uid]
    );
    const daysByHabit = new Map();
    for (const {habitId, day} of dayRows) {
        if (!daysByHabit.has(habitId)) daysByHabit.set(habitId, []);
        daysByHabit.get(habitId).push(day);
    }
    return rows.map((row) => toLocalHabit(row, daysByHabit.get(row.habitId) ?? []));
}

// This uid's unsynced, user-made completions (system rows with updatedAt = 0 never leave the device).
// Completions of soft-deleted habits are included: their XP is kept.
export async function getDirtyCompletions(db, uid) {
    requireUid(uid);
    return db.getAllAsync(
        `SELECT c.habitId, c.date, c.completed, c.updatedAt
        FROM completions c
        JOIN habits h ON h.habitId = c.habitId
        WHERE h.userId = ? AND c.synced = 0 AND c.updatedAt > 0
        ORDER BY c.date, c.habitId`,
        [uid]
    );
}

// synced = 1 only if the row still has the updatedAt that was pushed; a change made during the push stays unsynced
export async function markHabitSynced(db, uid, habitId, pushedUpdatedAt) {
    requireUid(uid);
    const result = await db.runAsync(
        `UPDATE habits SET synced = 1 WHERE habitId = ? AND userId = ? AND updatedAt = ?`,
        [habitId, uid, pushedUpdatedAt]
    );
    return result.changes === 1;
}

export async function markCompletionSynced(db, uid, habitId, date, pushedUpdatedAt) {
    requireUid(uid);
    const result = await db.runAsync(
        `UPDATE completions SET synced = 1
        WHERE habitId = ? AND date = ? AND updatedAt = ?
            AND habitId IN (SELECT habitId FROM habits WHERE userId = ?)`,
        [habitId, date, pushedUpdatedAt, uid]
    );
    return result.changes === 1;
}

// ---------- Pull side ----------

async function readLocalHabit(db, habitId) {
    const row = await db.getFirstAsync(`SELECT ${HABIT_COLUMNS} FROM habits WHERE habitId = ?`, [habitId]);
    if (!row) return null;
    const days = row.frequencyType === 'weekdays'
        ? (await db.getAllAsync('SELECT day FROM habitDays WHERE habitId = ?', [habitId])).map((d) => d.day)
        : [];
    return {row, habit: toLocalHabit(row, days)};
}

async function writeHabit(db, uid, habit, synced) {
    // userId is always the passed uid; the WHERE stops an upsert from ever touching another user's row
    const result = await db.runAsync(
        `INSERT INTO habits (${HABIT_COLUMNS})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (habitId) DO UPDATE SET
            habitName = excluded.habitName,
            icon = excluded.icon,
            frequencyType = excluded.frequencyType,
            reminderTime = excluded.reminderTime,
            source = excluded.source,
            createdAt = excluded.createdAt,
            updatedAt = excluded.updatedAt,
            deleted = excluded.deleted,
            synced = excluded.synced
        WHERE habits.userId = excluded.userId`,
        [habit.habitId, uid, habit.habitName, habit.icon, habit.frequencyType, habit.reminderTime, habit.source,
            habit.createdAt, habit.updatedAt, habit.deleted ? 1 : 0, synced]
    );
    if (result.changes !== 1) throw new Error('Remote habit could not be written'); // rolls the call back

    // habitDays are attribute rows of the habit: replaced together with it
    await db.runAsync('DELETE FROM habitDays WHERE habitId = ?', [habit.habitId]);
    if (habit.frequencyType === 'weekdays') {
        for (const day of habit.days) {
            await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [habit.habitId, day]);
        }
    }
}

// Merges remote habits (already parsed by docToHabit) into SQLite in ONE transaction, using mergeHabit:
// last-write-wins on updatedAt with sticky delete. A habitId owned by another user is skipped.
export async function applyRemoteHabits(db, uid, remoteHabits) {
    requireUid(uid);
    const summary = {written: 0, markedSynced: 0, markedDirty: 0, unchanged: 0, skippedOtherUser: 0};

    await db.withTransactionAsync(async () => {
        for (const input of remoteHabits) {
            const remote = pickHabit(input);
            const local = await readLocalHabit(db, remote.habitId);
            if (local && local.row.userId !== uid) {
                summary.skippedOtherUser += 1;
                continue;
            }

            const {habit, writeLocal, needsPush} = mergeHabit(local ? local.habit : null, remote);
            if (writeLocal) {
                await writeHabit(db, uid, habit, needsPush ? 0 : 1);
                summary.written += 1;
            } else if (needsPush) {
                // the local copy wins; make sure it is pushed
                await db.runAsync('UPDATE habits SET synced = 0 WHERE habitId = ? AND userId = ?', [habit.habitId, uid]);
                summary.markedDirty += 1;
            } else {
                // the local copy already equals the remote one (e.g. a push landed but marking it synced didn't)
                const result = await db.runAsync(
                    'UPDATE habits SET synced = 1 WHERE habitId = ? AND userId = ? AND updatedAt = ? AND synced = 0',
                    [habit.habitId, uid, habit.updatedAt]
                );
                if (result.changes === 1) summary.markedSynced += 1;
                else summary.unchanged += 1;
            }
        }
    });

    return summary;
}

// Merges remote completions (already parsed by docToCompletion) into SQLite in ONE transaction.
// Same rule as shouldApplyRemote in sync/merge.ts: applied only if there is no local row or the remote
// updatedAt is strictly newer (a tie keeps local). Completions whose habit isn't this uid's are skipped.
// Call applyRemoteHabits first: a completion's habit must exist (foreign keys stay on).
export async function applyRemoteCompletions(db, uid, remoteCompletions) {
    requireUid(uid);
    const summary = {applied: 0, markedSynced: 0, unchanged: 0, skippedMissingHabit: 0};

    await db.withTransactionAsync(async () => {
        const owned = new Set(
            (await db.getAllAsync('SELECT habitId FROM habits WHERE userId = ?', [uid])).map((r) => r.habitId)
        );

        for (const c of remoteCompletions) {
            if (!owned.has(c.habitId)) {
                summary.skippedMissingHabit += 1;
                continue;
            }

            const result = await db.runAsync(
                `INSERT INTO completions (habitId, date, completed, updatedAt, synced)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT (habitId, date) DO UPDATE SET
                    completed = excluded.completed,
                    updatedAt = excluded.updatedAt,
                    synced = 1
                WHERE excluded.updatedAt > completions.updatedAt`,
                [c.habitId, c.date, c.completed, c.updatedAt]
            );
            if (result.changes === 1) {
                summary.applied += 1;
                continue;
            }

            // not newer: if the local row is identical, it is already in Firestore, so mark it synced
            const same = await db.runAsync(
                `UPDATE completions SET synced = 1
                WHERE habitId = ? AND date = ? AND updatedAt = ? AND completed = ? AND synced = 0`,
                [c.habitId, c.date, c.updatedAt, c.completed]
            );
            if (same.changes === 1) summary.markedSynced += 1;
            else summary.unchanged += 1;
        }
    });

    return summary;
}
