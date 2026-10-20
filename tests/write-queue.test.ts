// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {createWriteQueue} from '../db/writeQueue.js';
import {emitLocalChange, onLocalChange} from '../db/localChanges.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Each test uses its own queue, so the deadlock test can't jam the others
describe('write queue', () => {
  test('tasks run one at a time, in call order', async () => {
    const enqueue = createWriteQueue();
    const log: string[] = [];
    const slow = enqueue(async () => {
      log.push('A start');
      await sleep(30);
      log.push('A end');
    });
    const fast = enqueue(async () => {
      log.push('B start');
      log.push('B end');
    });
    await Promise.all([slow, fast]);
    assert.deepEqual(log, ['A start', 'A end', 'B start', 'B end']);
  });

  test("each caller gets its own task's result", async () => {
    const enqueue = createWriteQueue();
    const [a, b] = await Promise.all([enqueue(async () => 1), enqueue(async () => 'two')]);
    assert.deepEqual([a, b], [1, 'two']);
  });

  test('a failed task rejects for its caller only; the next task still runs', async () => {
    const enqueue = createWriteQueue();
    const failing = enqueue(async () => {
      throw new Error('This habit no longer exists.');
    });
    const next = enqueue(async () => 'still runs');
    await assert.rejects(failing, /no longer exists/);
    assert.equal(await next, 'still runs');
  });

  test('a synchronous throw inside a task is a rejection, not a broken chain', async () => {
    const enqueue = createWriteQueue();
    await assert.rejects(enqueue(() => {
      throw new Error('boom');
    }));
    assert.equal(await enqueue(async () => 'ok'), 'ok');
  });

  test('awaiting enqueueWrite from OUTSIDE a task is fine (the normal pattern)', async () => {
    const enqueue = createWriteQueue();
    // like getHabitsWithTodayStatus: await one queued write (ensureTodayRows), then do more work,
    // then another caller's write; all from outside any task
    const first = await enqueue(async () => 'ensureTodayRows');
    const second = await enqueue(async () => `${first} then toggle`);
    assert.equal(second, 'ensureTodayRows then toggle');
  });

  test('DEADLOCK RULE: awaiting enqueueWrite INSIDE a task never settles', async () => {
    const enqueue = createWriteQueue();
    const outer = enqueue(async () => {
      await enqueue(async () => 'inner'); // forbidden: waits for the outer task, which waits for this
    });
    const timedOut = await Promise.race([outer.then(() => false), sleep(50).then(() => true)]);
    assert.equal(timedOut, true);
  });
});

describe('local changes', () => {
  test('listeners are called on emit and can unsubscribe', () => {
    let calls = 0;
    const unsubscribe = onLocalChange(() => {
      calls += 1;
    });
    emitLocalChange();
    unsubscribe();
    emitLocalChange();
    assert.equal(calls, 1);
  });

  test('a throwing listener never reaches the emitter, and other listeners still run', () => {
    let reached = false;
    const offBad = onLocalChange(() => {
      throw new Error('listener bug');
    });
    const offGood = onLocalChange(() => {
      reached = true;
    });
    const originalLog = console.log;
    console.log = () => {}; // silence the expected log line
    try {
      assert.doesNotThrow(() => emitLocalChange());
    } finally {
      console.log = originalLog;
      offBad();
      offGood();
    }
    assert.equal(reached, true);
  });
});
