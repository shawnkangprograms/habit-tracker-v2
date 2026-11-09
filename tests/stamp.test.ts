// S-1: the monotonic updatedAt stamp (db/stamp.js). The SQL fragments the write paths use give exactly what the rule
// nextUpdatedAt gives, on a real SQLite database with the app's migration. Node's built-in runner (npm test).
/// <reference types="node" />
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase} from './helpers/sqlite-adapter.ts';

const {nextUpdatedAt, STAMP_UPDATE_SQL, STAMP_UPSERT_SQL} = await import('../db/stamp.js');

test('nextUpdatedAt = max(now, previous + 1), and both SQL fragments agree with it', async () => {
  const NOW = 1_762_000_000_000;
  assert.deepEqual([0, NOW - 5, NOW - 1, NOW, NOW + 10].map((p) => nextUpdatedAt(NOW, p)), [NOW, NOW, NOW, NOW + 1, NOW + 11]);
  const db = await createTestDatabase();
  const ID = '11111111-1111-4111-8111-111111111111';
  for (const previous of [0, NOW - 5, NOW, NOW + 10]) {
    await db.runAsync('DELETE FROM completions');
    await db.runAsync('DELETE FROM habits');
    await db.runAsync(
      `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
      VALUES (?, 'u', 'Read', 'book', 'daily', NULL, 'user', 1, ?, 0, 1)`, [ID, Math.max(previous, 1)]);
    await db.runAsync('INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, 0, ?, 1)', [ID, '2026-11-09', previous]);
    await db.runAsync(`UPDATE habits SET updatedAt = ${STAMP_UPDATE_SQL} WHERE habitId = ?`, [NOW, ID]);
    await db.runAsync(
      `INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, 1, ?, 0)
      ON CONFLICT (habitId, date) DO UPDATE SET completed = excluded.completed, updatedAt = ${STAMP_UPSERT_SQL}, synced = 0`,
      [ID, '2026-11-09', NOW]);
    const habit = await db.getFirstAsync<{updatedAt: number}>('SELECT updatedAt FROM habits');
    const completion = await db.getFirstAsync<{updatedAt: number}>('SELECT updatedAt FROM completions');
    assert.equal(habit?.updatedAt, nextUpdatedAt(NOW, Math.max(previous, 1)), `habit, previous ${previous}`);
    assert.equal(completion?.updatedAt, nextUpdatedAt(NOW, previous), `completion, previous ${previous}`);
  }
});
