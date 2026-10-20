// Every SQLite WRITE goes through enqueueWrite, so writes run one at a time in call order and never
// overlap (expo-sqlite's withTransactionAsync is not exclusive: an overlapping write would join or
// break another write's transaction). Reads don't use the queue.
//
// DEADLOCK RULE: a queued task must never await another enqueueWrite. The inner task waits for the
// outer one, which is waiting for the inner one, forever. Only the public db/ entry points (addHabit,
// toggleCompletion, the db/sync.js functions, ...) enqueue; helpers they call (insertHabitDays,
// everything in db/syncCore.js) never do. Awaiting enqueueWrite from OUTSIDE a task is always fine.
// tests/write-queue.test.ts documents both cases.

export function createWriteQueue() {
    let tail = Promise.resolve();
    let pending = 0; // tasks queued or running

    // The caller gets the task's own result or error; a failed task never breaks the chain.
    function enqueue(task) {
        pending += 1;
        const run = tail.then(() => task()).finally(() => {
            pending -= 1;
        });
        tail = run.catch(() => {});
        return run;
    }

    // Number of tasks queued or running (tests use it to check no network call happens inside a write)
    enqueue.pendingCount = () => pending;
    return enqueue;
}

// The app's single queue
export const enqueueWrite = createWriteQueue();
