// Read-only habit queries that take the database explicitly, like db/syncCore.js: the app passes the
// expo-sqlite connection (db/habits.js), the tests a node:sqlite adapter. No expo imports here.

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // display order, Monday first

// Days of every active weekday habit of this user, as {habitId: days} with days sorted Mon..Sun.
// Daily and deleted habits get no entry (deleted = 0, as in getHabit). One query for the whole Home list.
export async function getActiveHabitDays(db, userId) {
    const rows = await db.getAllAsync(
        `SELECT d.habitId, d.day FROM habitDays d
        JOIN habits h ON h.habitId = d.habitId
        WHERE h.userId = ? AND h.deleted = 0 AND h.frequencyType = 'weekdays'`,
        [userId]
    );

    const byHabit = {};
    for (const row of rows) {
        if (!byHabit[row.habitId]) byHabit[row.habitId] = [];
        byHabit[row.habitId].push(row.day);
    }
    for (const days of Object.values(byHabit)) {
        days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    }
    return byHabit;
}
