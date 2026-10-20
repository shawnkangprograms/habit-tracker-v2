import {getDatabase} from '@/db/database';
import * as core from '@/db/syncCore';

// SQLite side of sync for the app: the functions in db/syncCore.js on the app's database connection.
// Not called by anything yet (sync engine: build stage 3).

export async function getDirtyHabits(uid) {
    return core.getDirtyHabits(await getDatabase(), uid);
}

export async function getDirtyCompletions(uid) {
    return core.getDirtyCompletions(await getDatabase(), uid);
}

export async function markHabitSynced(uid, habitId, pushedUpdatedAt) {
    return core.markHabitSynced(await getDatabase(), uid, habitId, pushedUpdatedAt);
}

export async function markCompletionSynced(uid, habitId, date, pushedUpdatedAt) {
    return core.markCompletionSynced(await getDatabase(), uid, habitId, date, pushedUpdatedAt);
}

export async function applyRemoteHabits(uid, remoteHabits) {
    return core.applyRemoteHabits(await getDatabase(), uid, remoteHabits);
}

export async function applyRemoteCompletions(uid, remoteCompletions) {
    return core.applyRemoteCompletions(await getDatabase(), uid, remoteCompletions);
}
