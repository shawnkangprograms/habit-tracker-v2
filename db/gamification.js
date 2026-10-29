import {getDatabase} from '@/db/database';
import {requireUserId} from '@/db/completions';
import * as core from '@/db/gamificationCore';

// XP, streaks, badges and level for the signed-in user, derived from local rows. Read-only: creates no rows.
// The queries live in db/gamificationCore.js, which takes the database explicitly.
export async function getGamificationStats(userId) {
    requireUserId(userId);
    return core.getGamificationStats(await getDatabase(), userId);
}

// The signed-in user's habits (deleted ones flagged) and completions for the Summary tab (utils/summary.ts).
// Three reads, one per table. Read-only: creates no rows, never touches sync.
export async function getSummaryRows(userId) {
    requireUserId(userId);
    return core.getUserRows(await getDatabase(), userId);
}
