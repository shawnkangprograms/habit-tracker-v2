// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';

// db/syncCore.js imports sync/merge.ts (and the validators) through "@/...", resolved by the alias hook
const core = await import('../db/syncCore.js');
type LocalHabit = import('../sync/merge.ts').LocalHabit;

const ME = 'uid-me';
const OTHER = 'uid-other';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const H3 = '33333333-3333-4333-8333-333333333333';

type HabitSeed = Partial<LocalHabit> & {habitId: string; userId?: string; synced?: 0 | 1};

async function seedHabit(db: TestDb, seed: HabitSeed) {
  const h = {
    userId: ME, habitName: 'Read', icon: 'book', frequencyType: 'daily', days: [] as string[], reminderTime: null,
    source: 'user', createdAt: 1000, updatedAt: 2000, deleted: false, synced: 1, ...seed,
  };
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [h.habitId, h.userId, h.habitName, h.icon, h.frequencyType, h.reminderTime, h.source, h.createdAt, h.updatedAt,
      h.deleted ? 1 : 0, h.synced],
  );
  for (const day of h.days) await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [h.habitId, day]);
}

async function seedCompletion(db: TestDb, habitId: string, date: string, completed: 0 | 1, updatedAt: number, synced: 0 | 1) {
  await db.runAsync(
    'INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, ?, ?, ?)',
    [habitId, date, completed, updatedAt, synced],
  );
}

type HabitRow = {userId: string; habitName: string; frequencyType: string; updatedAt: number; deleted: number; synced: number};
const habitRow = (db: TestDb, habitId: string) =>
  db.getFirstAsync<HabitRow>('SELECT * FROM habits WHERE habitId = ?', [habitId]);

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
async function daysOf(db: TestDb, habitId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{day: string}>('SELECT day FROM habitDays WHERE habitId = ?', [habitId]);
  return rows.map((r) => r.day).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

type CompletionRow = {completed: number; updatedAt: number; synced: number};
const completionRow = (db: TestDb, habitId: string, date: string) =>
  db.getFirstAsync<CompletionRow>('SELECT * FROM completions WHERE habitId = ? AND date = ?', [habitId, date]);

const remote = (over: Partial<LocalHabit> & {habitId: string}): LocalHabit => ({
  habitName: 'Read', icon: 'book', frequencyType: 'daily', days: [], reminderTime: null, alarm: false,
  remindBeforeMin: 0, source: 'user', createdAt: 1000, updatedAt: 2000, deleted: false, ...over,
});

describe('push side', () => {
  test('dirty habits: unsynced, this uid only, tombstones and days included', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, synced: 0, frequencyType: 'weekdays', days: ['mon', 'fri']});
    await seedHabit(db, {habitId: H2, synced: 0, deleted: true, createdAt: 1500});
    await seedHabit(db, {habitId: H3, synced: 1});
    await seedHabit(db, {habitId: '44444444-4444-4444-8444-444444444444', userId: OTHER, synced: 0});

    const dirty = await core.getDirtyHabits(db, ME);
    assert.deepEqual(dirty.map((h: LocalHabit) => h.habitId), [H1, H2]);
    assert.deepEqual([...dirty[0].days].sort(), ['fri', 'mon']);
    assert.equal(dirty[1].deleted, true);
    assert.equal('userId' in dirty[0], false);
  });

  test('dirty completions: exclude updatedAt = 0 and other users; include a deleted habit', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedHabit(db, {habitId: H2, deleted: true});
    await seedHabit(db, {habitId: H3, userId: OTHER});
    await seedCompletion(db, H1, '2026-10-20', 1, 500, 0); // user action
    await seedCompletion(db, H1, '2026-10-21', 0, 0, 0); // system row
    await seedCompletion(db, H1, '2026-10-19', 1, 400, 1); // already synced
    await seedCompletion(db, H2, '2026-10-20', 1, 600, 0); // deleted habit: still pushed
    await seedCompletion(db, H3, '2026-10-20', 1, 700, 0); // another user

    const dirty = await core.getDirtyCompletions(db, ME);
    assert.deepEqual(dirty, [
      {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500},
      {habitId: H2, date: '2026-10-20', completed: 1, updatedAt: 600},
    ]);
  });

  test('markHabitSynced refuses when updatedAt changed during the push', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, synced: 0, updatedAt: 2000});
    await db.runAsync('UPDATE habits SET updatedAt = 2500 WHERE habitId = ?', [H1]); // an edit during the push
    assert.equal(await core.markHabitSynced(db, ME, H1, 2000), false);
    assert.equal((await habitRow(db, H1))?.synced, 0);
    assert.equal(await core.markHabitSynced(db, ME, H1, 2500), true);
    assert.equal((await habitRow(db, H1))?.synced, 1);
    assert.equal(await core.markHabitSynced(db, OTHER, H1, 2500), false); // wrong uid never matches
  });

  test('markCompletionSynced refuses when a tap changed the row during the push', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedCompletion(db, H1, '2026-10-21', 1, 500, 0);
    await db.runAsync('UPDATE completions SET completed = 0, updatedAt = 600 WHERE habitId = ?', [H1]); // the tap
    assert.equal(await core.markCompletionSynced(db, ME, H1, '2026-10-21', 500), false);
    assert.equal((await completionRow(db, H1, '2026-10-21'))?.synced, 0);
    assert.equal(await core.markCompletionSynced(db, OTHER, H1, '2026-10-21', 600), false);
    assert.equal(await core.markCompletionSynced(db, ME, H1, '2026-10-21', 600), true);
  });
});

describe('applyRemoteHabits', () => {
  test('an older remote changes nothing', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, habitName: 'Mine', updatedAt: 3000, synced: 0});
    const summary = await core.applyRemoteHabits(db, ME, [remote({habitId: H1, habitName: 'Old', updatedAt: 2000})]);
    const row = await habitRow(db, H1);
    assert.equal(row?.habitName, 'Mine');
    assert.equal(row?.synced, 0); // still needs pushing
    assert.equal(summary.written, 0);
  });

  test('alarm and lead round trip: pulled into SQLite, then read back for a push unchanged', async () => {
    const db = await createTestDatabase();
    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, reminderTime: '07:30', alarm: true, remindBeforeMin: 30})]);
    assert.deepEqual(
      await db.getFirstAsync('SELECT alarm, remindBeforeMin, synced FROM habits WHERE habitId = ?', [H1]),
      {alarm: 1, remindBeforeMin: 30, synced: 1},
    );
    await db.runAsync('UPDATE habits SET synced = 0 WHERE habitId = ?', [H1]);
    const [dirty] = await core.getDirtyHabits(db, ME);
    assert.equal(dirty.alarm, true);
    assert.equal(dirty.remindBeforeMin, 30);

    // a newer remote that turns them off again
    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, reminderTime: '07:30', updatedAt: 3000})]);
    assert.deepEqual(await db.getFirstAsync('SELECT alarm, remindBeforeMin FROM habits WHERE habitId = ?', [H1]),
      {alarm: 0, remindBeforeMin: 0});
  });

  test('a newer remote updates the row and replaces habitDays', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, frequencyType: 'weekdays', days: ['mon', 'tue'], updatedAt: 2000});

    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, habitName: 'Run', frequencyType: 'weekdays', days: ['sat', 'sun'], updatedAt: 3000})]);
    assert.deepEqual(await daysOf(db, H1), ['sat', 'sun']);
    assert.equal((await habitRow(db, H1))?.habitName, 'Run');
    assert.equal((await habitRow(db, H1))?.synced, 1);

    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, frequencyType: 'daily', updatedAt: 4000})]);
    assert.deepEqual(await daysOf(db, H1), []);
    assert.equal((await habitRow(db, H1))?.frequencyType, 'daily');
  });

  test('sticky delete: a newer remote edit cannot undelete a local tombstone', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, deleted: true, updatedAt: 2000, synced: 0});
    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, habitName: 'Edited', updatedAt: 3000})]);
    const row = await habitRow(db, H1);
    assert.deepEqual([row?.deleted, row?.habitName, row?.updatedAt, row?.synced], [1, 'Edited', 3000, 0]);
  });

  test('sticky delete: a remote tombstone deletes a newer local edit, which is then pushed', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, habitName: 'Edited here', updatedAt: 3000, synced: 0});
    await core.applyRemoteHabits(db, ME, [remote({habitId: H1, deleted: true, updatedAt: 2000})]);
    const row = await habitRow(db, H1);
    assert.deepEqual([row?.deleted, row?.habitName, row?.updatedAt, row?.synced], [1, 'Edited here', 3000, 0]);
  });

  test("a habitId owned by another userId is skipped and left untouched", async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, userId: OTHER, habitName: 'Theirs', updatedAt: 2000});
    const summary = await core.applyRemoteHabits(db, ME, [remote({habitId: H1, habitName: 'Hijack', updatedAt: 9000})]);
    assert.equal(summary.skippedOtherUser, 1);
    const row = await habitRow(db, H1);
    assert.deepEqual([row?.userId, row?.habitName], [OTHER, 'Theirs']);
  });

  test('new habits always get the passed uid, never a userId from the input', async () => {
    const db = await createTestDatabase();
    const sneaky = {...remote({habitId: H1}), userId: OTHER} as LocalHabit;
    await core.applyRemoteHabits(db, ME, [sneaky, remote({habitId: H2, deleted: true})]);
    assert.equal((await habitRow(db, H1))?.userId, ME);
    assert.equal((await habitRow(db, H2))?.userId, ME); // tombstones are stored too
    assert.equal((await habitRow(db, H2))?.deleted, 1);
  });

  test('a local copy equal to the remote one is marked synced (push landed, mark did not)', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, updatedAt: 2000, synced: 0});
    const summary = await core.applyRemoteHabits(db, ME, [remote({habitId: H1, updatedAt: 2000})]);
    assert.equal(summary.markedSynced, 1);
    assert.equal((await habitRow(db, H1))?.synced, 1);
  });

  test('a failure rolls back the whole call', async () => {
    const db = await createTestDatabase();
    const tooLong = remote({habitId: H2, habitName: 'x'.repeat(31), updatedAt: 3000}); // fails the SQLite CHECK
    await assert.rejects(core.applyRemoteHabits(db, ME, [remote({habitId: H1}), tooLong]));
    assert.equal(await habitRow(db, H1), null);
    assert.equal(await habitRow(db, H2), null);
  });
});

describe('applyRemoteCompletions', () => {
  test('completions for a habit missing for this uid are skipped (no foreign-key error)', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedHabit(db, {habitId: H3, userId: OTHER});
    const summary = await core.applyRemoteCompletions(db, ME, [
      {habitId: H1, date: '2026-10-21', completed: 1, updatedAt: 500},
      {habitId: H2, date: '2026-10-21', completed: 1, updatedAt: 500}, // not present locally
      {habitId: H3, date: '2026-10-21', completed: 1, updatedAt: 500}, // another user's habit
    ]);
    assert.deepEqual([summary.applied, summary.skippedMissingHabit], [1, 2]);
    assert.equal((await completionRow(db, H1, '2026-10-21'))?.synced, 1);
    assert.equal(await completionRow(db, H3, '2026-10-21'), null);
  });

  test('newer remote wins; a tie or an older remote changes nothing; any remote beats a system row', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedCompletion(db, H1, '2026-10-19', 0, 500, 0);
    await seedCompletion(db, H1, '2026-10-20', 1, 500, 0);
    await seedCompletion(db, H1, '2026-10-21', 0, 0, 0); // system row

    await core.applyRemoteCompletions(db, ME, [
      {habitId: H1, date: '2026-10-19', completed: 1, updatedAt: 600}, // newer
      {habitId: H1, date: '2026-10-20', completed: 0, updatedAt: 500}, // tie, different value: local wins
      {habitId: H1, date: '2026-10-21', completed: 1, updatedAt: 1}, // beats the system row
    ]);
    assert.deepEqual(await completionRow(db, H1, '2026-10-19'), {habitId: H1, date: '2026-10-19', completed: 1, updatedAt: 600, synced: 1});
    assert.deepEqual(await completionRow(db, H1, '2026-10-20'), {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500, synced: 0});
    assert.equal((await completionRow(db, H1, '2026-10-21'))?.completed, 1);

    await core.applyRemoteCompletions(db, ME, [{habitId: H1, date: '2026-10-19', completed: 0, updatedAt: 550}]); // older
    assert.equal((await completionRow(db, H1, '2026-10-19'))?.completed, 1);
  });

  test('a remote copy equal to the local row marks it synced', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedCompletion(db, H1, '2026-10-21', 1, 500, 0);
    const summary = await core.applyRemoteCompletions(db, ME, [{habitId: H1, date: '2026-10-21', completed: 1, updatedAt: 500}]);
    assert.equal(summary.markedSynced, 1);
    assert.equal((await completionRow(db, H1, '2026-10-21'))?.synced, 1);
  });

  test('CHECK constraints still hold, and a failure rolls back the whole call', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await assert.rejects(core.applyRemoteCompletions(db, ME, [
      {habitId: H1, date: '2026-10-20', completed: 1, updatedAt: 500},
      {habitId: H1, date: '2026-10-21', completed: 2, updatedAt: 500},
    ]));
    assert.equal(await completionRow(db, H1, '2026-10-20'), null);
    await assert.rejects(core.applyRemoteCompletions(db, ME, [{habitId: H1, date: '21-10-2026', completed: 1, updatedAt: 500}]));
  });
});
