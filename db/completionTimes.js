import {getDatabase} from '@/db/database';
import {requireUserId} from '@/db/completions';

// Recent completed rows of one habit that a user action wrote (updatedAt > 0), before `beforeDate`, newest first.
// For "earlier than usual" (utils/completionTime.ts filters them to same-day ticks). A plain read: never queued
// as a write, and only called after the tick has already updated the screen. Uses the (habitId, date) key.
export async function getCompletionTimes(userId, habitId, beforeDate, limit = 60) {
    requireUserId(userId);
    const db = await getDatabase();
    return db.getAllAsync(
        `SELECT c.date, c.updatedAt FROM completions c
        JOIN habits h ON h.habitId = c.habitId
        WHERE c.habitId = ? AND h.userId = ? AND c.completed = 1 AND c.updatedAt > 0 AND c.date < ?
        ORDER BY c.date DESC
        LIMIT ?`,
        [habitId, userId, beforeDate, limit]
    );
}
