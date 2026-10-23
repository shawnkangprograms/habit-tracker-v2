import {getLocalDateString} from '@/utils/dates';
import {computeGamification} from '@/utils/gamification';

// XP, streaks, badges and level for one user, derived from local rows. Takes the database explicitly, like
// db/habitsCore.js: the app passes the expo-sqlite connection (db/gamification.js), the tests and the demo
// script a node:sqlite adapter. No expo imports here. Read-only: creates no rows.
// Deleted habits are loaded too: their completions keep their XP (utils/gamification.ts ignores them for scheduling).
export async function getGamificationStats(db, userId, today = getLocalDateString()) {
    const habitRows = await db.getAllAsync(
        `SELECT habitId, frequencyType, createdAt, deleted FROM habits WHERE userId = ?`,
        [userId]
    );
    const dayRows = await db.getAllAsync(
        `SELECT d.habitId, d.day FROM habitDays d
        JOIN habits h ON h.habitId = d.habitId
        WHERE h.userId = ?`,
        [userId]
    );
    const completionRows = await db.getAllAsync(
        `SELECT c.habitId, c.date, c.completed FROM completions c
        JOIN habits h ON h.habitId = c.habitId
        WHERE h.userId = ?`,
        [userId]
    );

    const daysByHabit = new Map();
    for (const row of dayRows) {
        if (!daysByHabit.has(row.habitId)) daysByHabit.set(row.habitId, []);
        daysByHabit.get(row.habitId).push(row.day);
    }

    const habits = habitRows.map((h) => ({
        habitId: h.habitId,
        createdDate: getLocalDateString(new Date(h.createdAt)),
        frequencyType: h.frequencyType,
        days: h.frequencyType === 'weekdays' ? daysByHabit.get(h.habitId) ?? [] : [],
        deleted: h.deleted === 1,
    }));
    const completions = completionRows.map((c) => ({
        habitId: c.habitId,
        date: c.date,
        completed: c.completed === 1,
    }));

    return computeGamification(habits, completions, today);
}
