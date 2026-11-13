import AsyncStorage from '@react-native-async-storage/async-storage';
import {createSyncEngine} from '@/sync/engineCore';
import {createCursorStore} from '@/sync/cursorStore';
import {firestoreRemote} from '@/sync/firestoreRemote';
import * as store from '@/db/sync';
import {emitRemoteChange} from '@/db/remoteChanges';
import {getFirebaseAuth} from '@/services/authInit';
import {mark, TRACE_ON} from '@/utils/startupTrace';
import {CURSOR_LINE_MIN_CYCLES} from '@/utils/syncStatusLine';

// The app's sync engine: the engine core (sync/engineCore.ts) on the real SQLite store (db/sync.js),
// Firestore (sync/firestoreRemote.js), pull cursors in AsyncStorage (per uid, kept across sign-outs)
// and the signed-in user. Each cycle pulls, then pushes. app/_layout.tsx starts it on sign-in and
// stops it on sign-out; triggers live there.

const engine = createSyncEngine({
    getUid: () => getFirebaseAuth().currentUser?.uid ?? null,
    store,
    remote: firestoreRemote,
    cursors: createCursorStore(AsyncStorage),
    onRemoteChange: emitRemoteChange, // Home reloads while focused
});

let activeUid = null;

// Dev only: one line per finished cycle, counts and error kinds (never habit names or doc contents)
if (__DEV__) {
    let previous = engine.getStatus().state;
    engine.subscribe((s) => {
        if (previous === 'syncing' && s.state !== 'syncing') {
            const pull = `pulled ${s.pullCounts.received} (invalid ${s.pullCounts.invalid}, changed ${s.pullCounts.changed})`;
            console.log(
                `Sync: ${s.state}, ${pull}, pullError ${s.pullError ?? 'none'}, pending ${s.pendingCount}, ` +
                `rejected ${s.rejectedCount}, error ${s.lastErrorKind ?? 'none'}, restored ${s.initialPullDone}, ` +
                `cursor read failures ${s.cursorReadFailures}`
            );
        }
        previous = s.state;
    });
}

// R-1, every build: a failed pull-cursor read ends the cycle before any network call and is never written over.
// Logged at the third cycle in a row (when Settings starts showing its line), once per run of failures; the
// cursors are never reset automatically.
let loggedCursorFailures = false;
engine.subscribe((s) => {
    if (s.cursorReadFailures >= CURSOR_LINE_MIN_CYCLES && !loggedCursorFailures) {
        loggedCursorFailures = true;
        console.log(`Sync: the pull cursors couldn't be read for ${s.cursorReadFailures} cycles in a row; backup is paused`);
        if (TRACE_ON) mark('sync:cursorReadFailing');
    } else if (s.cursorReadFailures === 0) {
        loggedCursorFailures = false;
    }
});

// Startup trace (preview build only): when the first cycle ends, whatever its result
if (TRACE_ON) {
    let previous = engine.getStatus().state;
    engine.subscribe((s) => {
        if (previous === 'syncing' && s.state !== 'syncing') mark('sync:firstCycleEnd');
        previous = s.state;
    });
}

// Signed in: start (or restart for a different uid) and run a cycle now
export function startSync(uid) {
    if (activeUid === uid) return;
    if (activeUid !== null) engine.stop();
    activeUid = uid;
    engine.start();
    void engine.requestSync();
}

// Signed out: any running cycle ends at its next check (no cursor save can start after this);
// status and push backoff are cleared. The per-uid pull cursors in AsyncStorage are kept.
export function stopSync() {
    activeUid = null;
    engine.stop();
}

export function requestSync() {
    return engine.requestSync();
}

// "Re-sync everything" (for Settings later): re-pull all of this user's docs from the start
export function requestFullSync() {
    return engine.forceFullPull();
}

// A committed local change: push shortly after the last one (debounced in the engine)
export function notifyLocalChange() {
    engine.notifyLocalChange();
}

export function getSyncStatus() {
    return engine.getStatus();
}

export function subscribeSyncStatus(listener) {
    return engine.subscribe(listener);
}
