import {getDatabase} from '@/db/database';
import {enqueueWrite} from '@/db/writeQueue';
import * as core from '@/db/syncCore';

// SQLite side of sync for the app: the functions in db/syncCore.js on the app's database connection.
// Writes go through the write queue; they never emit local-change events (sync must not trigger itself).

export async function getDirtyHabits(uid) {
    return core.getDirtyHabits(await getDatabase(), uid);
}

export async function getDirtyCompletions(uid) {
    return core.getDirtyCompletions(await getDatabase(), uid);
}

export function markHabitSynced(uid, habitId, pushedUpdatedAt) {
    return enqueueWrite(async () => core.markHabitSynced(await getDatabase(), uid, habitId, pushedUpdatedAt));
}

export function markCompletionSynced(uid, habitId, date, pushedUpdatedAt) {
    return enqueueWrite(async () => core.markCompletionSynced(await getDatabase(), uid, habitId, date, pushedUpdatedAt));
}

export function applyRemoteHabits(uid, remoteHabits) {
    return enqueueWrite(async () => core.applyRemoteHabits(await getDatabase(), uid, remoteHabits));
}

export function applyRemoteCompletions(uid, remoteCompletions) {
    return enqueueWrite(async () => core.applyRemoteCompletions(await getDatabase(), uid, remoteCompletions));
}
