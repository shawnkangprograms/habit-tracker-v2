// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';

const {migrateDbIfNeeded, DATABASE_VERSION} = await import('../db/schema.js');

const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';

const version = async (db: TestDb) => (await db.getFirstAsync<{user_version: number}>('PRAGMA user_version'))?.user_version;
const habitColumns = async (db: TestDb) =>
  (await db.getAllAsync<{name: string}>('PRAGMA table_info(habits)')).map((c) => c.name);

// A schema-v1 database (the real v1 step) holding a daily habit with a reminder, a weekday habit, a
// tombstone, their days and completions, as an existing phone has them before the update
async function v1WithRows(): Promise<TestDb> {
  const db = await createTestDatabase({version: 1});
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, 'uid', 'Read', 'book', 'daily', '07:30', 'user', 1000, 2000, 0, 1),
           (?, 'uid', 'Run', 'run', 'weekdays', NULL, 'ai_suggested', 1100, 2100, 1, 0)`,
    [H1, H2],
  );
  await db.runAsync(`INSERT INTO habitDays (habitId, day) VALUES (?, 'mon'), (?, 'thu')`, [H2, H2]);
  await db.runAsync(
    `INSERT INTO completions (habitId, date, completed, updatedAt, synced)
    VALUES (?, '2026-10-21', 1, 5000, 1), (?, '2026-10-22', 0, 0, 0)`,
    [H1, H2],
  );
  return db;
}

const snapshot = async (db: TestDb) => ({
  habits: await db.getAllAsync(
    `SELECT habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced
    FROM habits ORDER BY habitId`,
  ),
  days: await db.getAllAsync('SELECT * FROM habitDays ORDER BY habitId, day'),
  completions: await db.getAllAsync('SELECT * FROM completions ORDER BY habitId, date'),
});

describe('migration v1 -> v2 (alarm, remindBeforeMin)', () => {
  test('every existing row survives unchanged, with alarm 0 and remindBeforeMin 0', async () => {
    const db = await v1WithRows();
    assert.equal(await version(db), 1);
    assert.equal((await habitColumns(db)).includes('alarm'), false);
    const before = await snapshot(db);

    await migrateDbIfNeeded(db);

    assert.equal(DATABASE_VERSION, 2);
    assert.equal(await version(db), 2);
    assert.deepEqual(await snapshot(db), before);
    assert.deepEqual(
      await db.getAllAsync('SELECT habitId, alarm, remindBeforeMin FROM habits ORDER BY habitId'),
      [{habitId: H1, alarm: 0, remindBeforeMin: 0}, {habitId: H2, alarm: 0, remindBeforeMin: 0}],
    );
  });

  test('running the migration twice is harmless (nothing runs at v2)', async () => {
    const db = await v1WithRows();
    await migrateDbIfNeeded(db);
    const once = await snapshot(db);
    await migrateDbIfNeeded(db);
    assert.equal(await version(db), 2);
    assert.deepEqual(await snapshot(db), once);
    assert.equal((await habitColumns(db)).filter((c) => c === 'alarm').length, 1);
  });

  test('a fresh install runs v1 then v2 and gets the defaults on insert', async () => {
    const db = await createTestDatabase();
    assert.equal(await version(db), 2);
    await db.runAsync(
      `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
      VALUES (?, 'uid', 'Read', 'book', 'daily', NULL, 'user', 1, 1, 0, 0)`,
      [H1],
    );
    assert.deepEqual(await db.getFirstAsync('SELECT alarm, remindBeforeMin FROM habits'), {alarm: 0, remindBeforeMin: 0});
  });

  test('the CHECK constraints reject values outside the allowed sets', async () => {
    const db = await createTestDatabase();
    const insert = (alarm: number, lead: number) => db.runAsync(
      `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, alarm, remindBeforeMin,
        source, createdAt, updatedAt, deleted, synced)
      VALUES (?, 'uid', 'Read', 'book', 'daily', NULL, ?, ?, 'user', 1, 1, 0, 0)`,
      [H1, alarm, lead],
    );
    await assert.rejects(insert(2, 0), /CHECK/);
    await assert.rejects(insert(0, 7), /CHECK/);
    await insert(1, 60);
  });

  test('a failure halfway rolls the whole step back: v1 schema, version 1, rows intact; a retry can succeed', async () => {
    const db = await v1WithRows();
    const before = await snapshot(db);
    // make the SECOND statement of the step fail (duplicate column) after the first one has run
    db.raw.exec('ALTER TABLE habits ADD COLUMN remindBeforeMin INTEGER NOT NULL DEFAULT 0');
    await assert.rejects(migrateDbIfNeeded(db), /duplicate column/);

    assert.equal(await version(db), 1);
    assert.equal((await habitColumns(db)).includes('alarm'), false, 'the first ALTER was rolled back too');
    assert.deepEqual(await snapshot(db), before);

    // the next launch retries the same step (here after removing the conflicting column)
    db.raw.exec('ALTER TABLE habits DROP COLUMN remindBeforeMin');
    await migrateDbIfNeeded(db);
    assert.equal(await version(db), 2);
  });
});
