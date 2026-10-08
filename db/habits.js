import * as Crypto from 'expo-crypto';
import {getDatabase} from '@/db/database';
import {ensureTodayRows, requireUserId, SCHEDULED_ON_DAY_SQL} from '@/db/completions';
import {getLocalDateString, getLocalWeekdayKey} from '@/utils/dates';
import {validateHabitInput} from '@/validation/validators';

function validateOrThrow(input) {
    const result = validateHabitInput(input ?? {});
    if (!result.valid) throw new Error(result.error);
    return result.value;
}

async function insertHabitDays(db, habitId, frequency) {
    if (frequency.type !== 'weekdays') return;
    for (const day of frequency.days) {
        await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [habitId, day]);
    }
}

// User action: add a habit. Today's completion row is created by ensureTodayRows (system row).
export async function addHabit(userId, input) {
    requireUserId(userId);
    const habit = validateOrThrow(input);
    const habitId = Crypto.randomUUID();
    const now = Date.now();
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
        await db.runAsync(
            `INSERT INTO habits
                (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
            VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, 0, 0)`,
            [habitId, userId, habit.habitName, habit.icon, habit.frequency.type, habit.reminderTime, now, now]
        );
        await insertHabitDays(db, habitId, habit.frequency);
    });

    return habitId;
}

// One active habit in the shape the edit form will need, or null.
export async function getHabit(userId, habitId) {
    requireUserId(userId);
    const db = await getDatabase();

    const row = await db.getFirstAsync(
        `SELECT habitId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt
        FROM habits WHERE habitId = ? AND userId = ? AND deleted = 0`,
        [habitId, userId]
    );
    if (!row) return null;

    const {frequencyType, ...rest} = row;
    if (frequencyType === 'daily') return {...rest, frequency: {type: 'daily'}};

    const days = await db.getAllAsync('SELECT day FROM habitDays WHERE habitId = ?', [habitId]);
    return {...rest, frequency: {type: 'weekdays', days: days.map((d) => d.day)}};
}

// Home list: active habits scheduled today, with today's completed flag.
export async function getHabitsWithTodayStatus(userId) {
    requireUserId(userId);
    // Computed once so ensureTodayRows and the SELECT agree, even across midnight.
    const today = getLocalDateString();
    const weekdayKey = getLocalWeekdayKey();

    await ensureTodayRows(userId, today, weekdayKey);
    const db = await getDatabase();

    return db.getAllAsync(
        `SELECT h.habitId, h.habitName, h.icon, h.frequencyType, h.reminderTime, c.completed
        FROM habits h
        JOIN completions c ON c.habitId = h.habitId AND c.date = ?
        WHERE h.userId = ? AND h.deleted = 0 AND ${SCHEDULED_ON_DAY_SQL}
        ORDER BY h.createdAt`,
        [today, userId, weekdayKey]
    );
}

// User action: full edit. Completion rows are never changed, so past history keeps its old frequency.
export async function updateHabit(userId, habitId, input) {
    requireUserId(userId);
    const habit = validateOrThrow(input);
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
            `UPDATE habits
            SET habitName = ?, icon = ?, frequencyType = ?, reminderTime = ?, updatedAt = ?, synced = 0
            WHERE habitId = ? AND userId = ? AND deleted = 0`,
            [habit.habitName, habit.icon, habit.frequency.type, habit.reminderTime, Date.now(), habitId, userId]
        );
        if (result.changes === 0) throw new Error('This habit no longer exists.');

        // habitDays are attribute rows of the habit; their sync rides on the habit's updatedAt/synced.
        await db.runAsync('DELETE FROM habitDays WHERE habitId = ?', [habitId]);
        await insertHabitDays(db, habitId, habit.frequency);
    });
}

// User action: soft delete. habitDays and completions are kept.
export async function softDeleteHabit(userId, habitId) {
    requireUserId(userId);
    const db = await getDatabase();

    const result = await db.runAsync(
        `UPDATE habits SET deleted = 1, updatedAt = ?, synced = 0
        WHERE habitId = ? AND userId = ? AND deleted = 0`,
        [Date.now(), habitId, userId]
    );
    if (result.changes === 0) throw new Error('This habit no longer exists.');
}
