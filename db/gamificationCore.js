import {getLocalDateString} from '@/utils/dates';
import {computeGamification} from '@/utils/gamification';

// XP, streaks, badges and level for one user, derived from local rows. Takes the database explicitly, like
// db/habitsCore.js: the app passes the expo-sqlite connection (db/gamification.js), the tests and the demo
// script a node:sqlite adapter. No expo imports here. Read-only: creates no rows.
// Deleted habits are loaded too: their completions keep their XP (utils/gamification.ts ignores them for scheduling).

// Every habit (deleted ones too, flagged), its weekdays and its completions for this user: ONE query per table.
// Shaped for utils/gamification.ts and utils/summary.ts: habits get a local createdDate and their days
// (empty for daily habits), completed becomes a boolean. Read-only: creates no rows.
export async function getUserRows(db, userId) {
    const habitRows = await db.getAllAsync(
        `SELECT habitId, habitName, icon, frequencyType, createdAt, deleted FROM habits WHERE userId = ?`,
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
        habitName: h.habitName,
        icon: h.icon,
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

    return {habits, completions};
}

export async function getGamificationStats(db, userId, today = getLocalDateString()) {
    const {habits, completions} = await getUserRows(db, userId);
    return computeGamification(habits, completions, today);
}
