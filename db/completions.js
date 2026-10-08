import {getDatabase} from '@/db/database';
import {getLocalDateString, getLocalWeekdayKey} from '@/utils/dates';
import {validateCompleted} from '@/validation/validators';

export function requireUserId(userId) {
    if (typeof userId !== 'string' || userId.length === 0) {
        throw new Error('You need to be signed in.');
    }
}

// SQL fragment: habit `h` is scheduled on the weekday bound to the `?` placeholder.
export const SCHEDULED_ON_DAY_SQL = `(h.frequencyType = 'daily'
    OR EXISTS (SELECT 1 FROM habitDays d WHERE d.habitId = h.habitId AND d.day = ?))`;

// System-created rows: today's completion row for every active habit scheduled today.
// updatedAt = 0 so a system row can never overwrite a real user action during sync.
export async function ensureTodayRows(userId, today = getLocalDateString(), weekdayKey = getLocalWeekdayKey()) {
    requireUserId(userId);
    const db = await getDatabase();
    // ON CONFLICT DO NOTHING only skips rows that already exist; CHECK/NOT NULL failures still throw.
    await db.runAsync(
        `INSERT INTO completions (habitId, date, completed, updatedAt, synced)
        SELECT h.habitId, ?, 0, 0, 0
        FROM habits h
        WHERE h.userId = ? AND h.deleted = 0 AND ${SCHEDULED_ON_DAY_SQL}
        ON CONFLICT (habitId, date) DO NOTHING`,
        [today, userId, weekdayKey]
    );
}

// User action: set today's completion for one habit. Only today's row is ever touched.
export async function toggleCompletion(userId, habitId, completed) {
    requireUserId(userId);
    const check = validateCompleted(completed);
    if (!check.valid) throw new Error(check.error);

    const today = getLocalDateString();
    const weekdayKey = getLocalWeekdayKey();
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
        const habit = await db.getFirstAsync(
            `SELECT h.habitId, ${SCHEDULED_ON_DAY_SQL} AS scheduledToday
            FROM habits h
            WHERE h.habitId = ? AND h.userId = ? AND h.deleted = 0`,
            [weekdayKey, habitId, userId]
        );
        if (!habit) throw new Error('This habit no longer exists.');
        if (!habit.scheduledToday) throw new Error("This habit isn't scheduled today.");

        await db.runAsync(
            `INSERT INTO completions (habitId, date, completed, updatedAt, synced)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT (habitId, date) DO UPDATE SET
                completed = excluded.completed,
                updatedAt = excluded.updatedAt,
                synced = 0`,
            [habitId, today, check.value ? 1 : 0, Date.now()]
        );
    });
}
