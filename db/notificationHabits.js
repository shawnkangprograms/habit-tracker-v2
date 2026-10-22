import {getDatabase} from '@/db/database';
import {requireUserId} from '@/db/completions';

// Everything the notification schedule needs, in ONE plain read (never queued as a write, creates no rows):
// every active habit with its weekdays and whether it is completed today. Only called when a notification
// switch is on. Weekday days come back as a comma list from GROUP_CONCAT and are split here.
export async function getScheduleHabits(userId, today) {
    requireUserId(userId);
    const db = await getDatabase();
    const rows = await db.getAllAsync(
        `SELECT h.habitId, h.habitName, h.frequencyType, h.reminderTime, h.alarm, h.remindBeforeMin,
            MAX(COALESCE(c.completed, 0)) AS completedToday,
            GROUP_CONCAT(d.day) AS days
        FROM habits h
        LEFT JOIN completions c ON c.habitId = h.habitId AND c.date = ?
        LEFT JOIN habitDays d ON d.habitId = h.habitId
        WHERE h.userId = ? AND h.deleted = 0
        GROUP BY h.habitId`,
        [today, userId]
    );
    return rows.map((r) => ({
        habitId: r.habitId,
        habitName: r.habitName,
        frequencyType: r.frequencyType,
        days: r.frequencyType === 'weekdays' && r.days ? String(r.days).split(',') : [],
        reminderTime: r.reminderTime,
        alarm: r.alarm === 1,
        remindBeforeMin: r.remindBeforeMin,
        completedToday: r.completedToday === 1,
    }));
}
