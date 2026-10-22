// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';

const core = await import('../db/habitsCore.js');

const ME = 'uid-me';
const OTHER = 'uid-other';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const H3 = '33333333-3333-4333-8333-333333333333';
const H4 = '44444444-4444-4444-8444-444444444444';

type HabitSeed = {habitId: string; userId?: string; frequencyType?: 'daily' | 'weekdays'; days?: string[]; deleted?: boolean};

async function seedHabit(db: TestDb, seed: HabitSeed) {
  const h = {userId: ME, frequencyType: 'daily', days: [] as string[], deleted: false, ...seed};
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, 'Read', 'book', ?, NULL, 'user', 1000, 2000, ?, 1)`,
    [h.habitId, h.userId, h.frequencyType, h.deleted ? 1 : 0],
  );
  for (const day of h.days) await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [h.habitId, day]);
}

// habitId -> days, from the rows getActiveHabitsWithDays returns
async function daysById(db: TestDb, userId: string) {
  const rows = await core.getActiveHabitsWithDays(db, userId);
  return Object.fromEntries(rows.map((r: {habitId: string; days: string[]}) => [r.habitId, r.days]));
}

describe('getActiveHabitsWithDays', () => {
  test('every active habit in one read: weekday days sorted Mon..Sun, daily habits get []', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1});
    await seedHabit(db, {habitId: H2, frequencyType: 'weekdays', days: ['sun', 'fri', 'mon', 'wed']});
    await seedHabit(db, {habitId: H3, frequencyType: 'weekdays', days: ['sat']});

    assert.deepEqual(await daysById(db, ME), {[H1]: [], [H2]: ['mon', 'wed', 'fri', 'sun'], [H3]: ['sat']});
    const [first] = await core.getActiveHabitsWithDays(db, ME);
    assert.deepEqual(first, {
      habitId: H1, habitName: 'Read', icon: 'book', frequencyType: 'daily', reminderTime: null, alarm: 0, createdAt: 1000, days: [],
    });
  });

  test('deleted habits are excluded, as in getHabit (deleted = 0)', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, frequencyType: 'weekdays', days: ['tue'], deleted: true});
    await seedHabit(db, {habitId: H2, frequencyType: 'weekdays', days: ['thu']});

    assert.deepEqual(await daysById(db, ME), {[H2]: ['thu']});
  });

  test("other users' habits are not returned", async () => {
    const db = await createTestDatabase();
    await seedHabit(db, {habitId: H1, frequencyType: 'weekdays', days: ['mon']});
    await seedHabit(db, {habitId: H4, userId: OTHER, frequencyType: 'weekdays', days: ['mon', 'tue']});

    assert.deepEqual(await daysById(db, ME), {[H1]: ['mon']});
    assert.deepEqual(await daysById(db, OTHER), {[H4]: ['mon', 'tue']});
  });

  test('no habits: an empty result, and the read creates no rows', async () => {
    const db = await createTestDatabase();
    assert.deepEqual(await core.getActiveHabitsWithDays(db, ME), []);
    await seedHabit(db, {habitId: H1, frequencyType: 'weekdays', days: ['mon']});
    await core.getActiveHabitsWithDays(db, ME);
    const counts = await db.getFirstAsync<{habits: number; days: number; completions: number}>(
      `SELECT (SELECT COUNT(*) FROM habits) AS habits, (SELECT COUNT(*) FROM habitDays) AS days,
        (SELECT COUNT(*) FROM completions) AS completions`,
    );
    assert.deepEqual(counts, {habits: 1, days: 1, completions: 0});
  });
});
