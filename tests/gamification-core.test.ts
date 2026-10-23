// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase} from './helpers/sqlite-adapter.ts';

// db/gamification.js gets its connection from '@/db/database' (expo-sqlite, which can't load under Node).
// This hook, registered after alias.ts so it runs first, swaps in a stub that returns the test database.
const testDb = await createTestDatabase();
(globalThis as {__gamiTestDb?: unknown}).__gamiTestDb = testDb;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/database') {
      const stub = 'export async function getDatabase() { return globalThis.__gamiTestDb; }';
      return {url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});

const wrapper = await import('../db/gamification.js');
const core = await import('../db/gamificationCore.js');
const {getLocalDateString} = await import('../utils/dates.ts');

const ME = 'uid-me';
const OTHER = 'uid-other';
const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';
const H3 = '33333333-3333-4333-8333-333333333333';
const H4 = '44444444-4444-4444-8444-444444444444';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

test('the wrapper and the core give identical results for the same rows', async () => {
  const created = daysAgo(20).getTime();
  const habits: [string, string, string, number][] = [
    [H1, ME, 'daily', 0], [H2, ME, 'weekdays', 0], [H3, ME, 'daily', 1], [H4, OTHER, 'daily', 0],
  ];
  for (const [habitId, userId, frequencyType, deleted] of habits) {
    await testDb.runAsync(
      `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
      VALUES (?, ?, 'Read', 'book', ?, NULL, 'user', ?, ?, ?, 1)`,
      [habitId, userId, frequencyType, created, created, deleted],
    );
  }
  for (const day of ['mon', 'wed', 'fri']) await testDb.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [H2, day]);
  for (let n = 20; n >= 0; n--) {
    const date = getLocalDateString(daysAgo(n));
    for (const habitId of [H1, H2, H3, H4]) {
      await testDb.runAsync('INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, ?, 0, 0)',
        [habitId, date, n % 4 === 1 ? 0 : 1]);
    }
  }

  const fromWrapper = await wrapper.getGamificationStats(ME);
  const fromCore = await core.getGamificationStats(testDb, ME);
  assert.deepEqual(fromWrapper, fromCore);
  assert.ok(fromCore.totalXp > 0, 'the rows earned some XP, so the comparison is not of two empty results');
  await assert.rejects(wrapper.getGamificationStats(''), /signed in/);
});
