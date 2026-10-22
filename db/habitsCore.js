// Read-only habit queries that take the database explicitly, like db/syncCore.js: the app passes the
// expo-sqlite connection (db/habits.js), the tests a node:sqlite adapter. No expo imports here.

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // display order, Monday first

// Every active habit of this user with its weekdays, in ONE query (no row per habit): Home's "Other days"
// section, the weekday subtitles and the habit count. Days are sorted Mon..Sun here (GROUP_CONCAT order is
// not defined); daily habits get []. Deleted habits are excluded (deleted = 0, as in getHabit). Creates no rows.
export async function getActiveHabitsWithDays(db, userId) {
    const rows = await db.getAllAsync(
        `SELECT h.habitId, h.habitName, h.icon, h.frequencyType, h.reminderTime, h.alarm, h.createdAt,
            GROUP_CONCAT(d.day) AS days
        FROM habits h
        LEFT JOIN habitDays d ON d.habitId = h.habitId
        WHERE h.userId = ? AND h.deleted = 0
        GROUP BY h.habitId
        ORDER BY h.createdAt, h.habitId`,
        [userId]
    );
    return rows.map(({days, ...habit}) => ({
        ...habit,
        days: habit.frequencyType === 'weekdays' && days
            ? String(days).split(',').sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
            : [],
    }));
}
