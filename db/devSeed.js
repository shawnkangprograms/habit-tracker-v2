import {getDatabase} from '@/db/database';
import {enqueueWrite} from '@/db/writeQueue';
import {getLocalDateString} from '@/utils/dates';

// DEV ONLY: seed same-day completion history for one habit, so "earlier than usual" can be tested on a phone.
// Triggered by a long press on the Settings title. In a release build __DEV__ is false, this export is null
// and the function body is dead code that the minifier strips.
//
// Two steps, no visible UI: the first call only LOGS what it would insert and arms itself; a second call within
// CONFIRM_WINDOW_MS inserts exactly that and logs the result. Rows go through the normal write queue, are never
// overwritten (ON CONFLICT DO NOTHING), and are saved as synced = 1 so they stay on this phone (never pushed).
// They add real XP and streak days to this account's local data.

const SEED_DAYS = 6;
const SEED_MINUTES_AFTER_NOW = 120;// the seeded "usual" time, so a tick right now is 2 h earlier
const LATEST_SEED_MINUTE = 23 * 60 + 30;
const MINUTE_JITTER = [0, 4, -3, 2, -5, 1];// "about the same time": a few minutes apart, still deterministic
const CONFIRM_WINDOW_MS = 15 * 1000;

let armed = null;// {plan, expiresAt} after the first call

function pad(n) {
    return String(n).padStart(2, '0');
}

async function buildPlan(userId) {
    const db = await getDatabase();
    const habit = await db.getFirstAsync(
        `SELECT habitId, icon FROM habits
        WHERE userId = ? AND deleted = 0 AND frequencyType = 'daily'
        ORDER BY createdAt ASC LIMIT 1`,
        [userId]
    );
    if (!habit) return {error: 'no active daily habit for this user; add one first'};

    const now = new Date();
    const baseMinute = now.getHours() * 60 + now.getMinutes() + SEED_MINUTES_AFTER_NOW;
    if (baseMinute + 5 > LATEST_SEED_MINUTE) {
        return {error: `too late in the day: the seeded time would pass midnight. Try before ${pad(Math.floor((LATEST_SEED_MINUTE - 5 - SEED_MINUTES_AFTER_NOW) / 60))}:${pad((LATEST_SEED_MINUTE - 5 - SEED_MINUTES_AFTER_NOW) % 60)}`};
    }

    const rows = [];
    for (let i = 1; i <= SEED_DAYS; i++) {
        const minute = baseMinute + MINUTE_JITTER[i - 1];
        // local constructor on each step, so the date and time are local (never toISOString)
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, Math.floor(minute / 60), minute % 60);
        rows.push({date: getLocalDateString(day), updatedAt: at.getTime(), time: `${pad(at.getHours())}:${pad(at.getMinutes())}`});
    }
    return {userId, habitId: habit.habitId, icon: habit.icon, rows};
}

function describe(plan) {
    return plan.rows.map((r) => `${r.date} ${r.time}`).join(', ');
}

export const devSeedEarlyPraise = __DEV__
    ? async function devSeedEarlyPraise(userId) {
        try {
            if (!userId) {
                console.log('Dev seed: not signed in, nothing to do');
                return;
            }
            const now = Date.now();
            if (!armed || armed.expiresAt < now || armed.plan.userId !== userId) {
                const plan = await buildPlan(userId);
                if (plan.error) {
                    armed = null;
                    console.log(`Dev seed: refused, ${plan.error}`);
                    return;
                }
                armed = {plan, expiresAt: now + CONFIRM_WINDOW_MS};
                console.log(
                    `Dev seed: WOULD insert ${plan.rows.length} completed rows (synced = 1, local only; existing rows are skipped) ` +
                    `for habit ${plan.habitId} (icon "${plan.icon}") at: ${describe(plan)}. ` +
                    `Long-press the Settings title again within ${CONFIRM_WINDOW_MS / 1000} s to confirm.`
                );
                return;
            }

            const {plan} = armed;
            armed = null;
            const inserted = [];
            await enqueueWrite(async () => {
                const db = await getDatabase();
                await db.withTransactionAsync(async () => {
                    for (const row of plan.rows) {
                        const result = await db.runAsync(
                            `INSERT INTO completions (habitId, date, completed, updatedAt, synced)
                            VALUES (?, ?, 1, ?, 1)
                            ON CONFLICT (habitId, date) DO NOTHING`,
                            [plan.habitId, row.date, row.updatedAt]
                        );
                        if (result.changes > 0) inserted.push(row);
                    }
                });
            });
            const skipped = plan.rows.length - inserted.length;
            console.log(
                `Dev seed: inserted ${inserted.length} rows for habit ${plan.habitId}: ${describe({rows: inserted}) || 'none'}` +
                (skipped > 0 ? `; skipped ${skipped} date(s) that already had a row` : '') +
                '. Open Home (it reloads on focus), then tick that habit now.'
            );
        } catch (err) {
            armed = null;
            console.log('Dev seed: failed', err);
        }
    }
    : null;
