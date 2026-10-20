// "Sync changed local data" signal, so screens showing local data can reload without waiting for focus.
// Emitted by the sync engine after a pulled page has committed and changed at least one row.
// Same shape as db/localChanges.js.

const listeners = new Set();

// Returns an unsubscribe function
export function onRemoteChange(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitRemoteChange() {
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch (err) {
            console.log('Remote change listener failed', err); // a listener can never break sync
        }
    }
}
