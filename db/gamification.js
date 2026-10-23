import {getDatabase} from '@/db/database';
import {requireUserId} from '@/db/completions';
import * as core from '@/db/gamificationCore';

// XP, streaks, badges and level for the signed-in user, derived from local rows. Read-only: creates no rows.
// The queries live in db/gamificationCore.js, which takes the database explicitly.
export async function getGamificationStats(userId) {
    requireUserId(userId);
    return core.getGamificationStats(await getDatabase(), userId);
}
