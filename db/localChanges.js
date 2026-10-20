// "The user changed local data" signal, so the sync engine can push soon after a change without the
// db layer knowing about Firebase. Emitted by user actions only (add, edit, delete, toggle), after the
// write has committed; never by system rows (ensureTodayRows) or by sync itself.

const listeners = new Set();

// Returns an unsubscribe function
export function onLocalChange(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitLocalChange() {
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch (err) {
            console.log('Local change listener failed', err); // a listener can never break the write that emitted
        }
    }
}
