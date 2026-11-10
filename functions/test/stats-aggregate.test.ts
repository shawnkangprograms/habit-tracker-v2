// Admin stats (functions/src/stats): the pure aggregate, test-account exclusion, privacy of the output, the
// refresh limit, and the loader against a fake Admin SDK. Run: cd functions && npm test
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

const agg = await import('../src/stats/aggregate.js');
const {loadStatsInput} = await import('../src/stats/load.js');

const HOUR = 3600 * 1000;
const at = (date: string, hour: number) => agg.nairobiDayStartMs(date) + hour * HOUR;// Nairobi wall-clock time
const NOW = at('2026-11-10', 10);// Tue 10 Nov 2026, 10:00 Nairobi
const DAY = '2026-11-09';// Monday, the closed day the nightly run reports

// u-real-1 and u-real-2 are real; u-test-1 is a seeded test account
function fixture() {
  return {
    authUsers: [
      {uid: 'u-real-1', createdMs: at('2026-10-01', 9), lastRefreshMs: at('2026-11-09', 20)},
      {uid: 'u-real-2', createdMs: at('2026-11-09', 8), lastRefreshMs: at('2026-11-04', 12)},
      {uid: 'u-test-1', createdMs: at('2026-11-03', 9), lastRefreshMs: at('2026-11-10', 9)},
      {uid: 'u-empty', createdMs: at('2026-11-10', 9), lastRefreshMs: null},// signed up today: after DAY
    ],
    testUids: ['u-test-1'],
    habits: [
      // u-real-1: daily run (Health) with a reminder, weekdays mon/wed book (Learning), a deleted one
      {uid: 'u-real-1', habitId: 'a', icon: 'run', frequencyType: 'daily', days: [], reminderTime: '07:30', source: 'user',
        createdAt: at('2026-10-01', 9), deleted: false, serverUpdatedMs: at('2026-10-01', 9)},
      {uid: 'u-real-1', habitId: 'b', icon: 'book', frequencyType: 'weekdays', days: ['mon', 'wed'], reminderTime: null,
        source: 'ai_suggested', createdAt: at('2026-10-01', 9), deleted: false, serverUpdatedMs: at('2026-10-01', 9)},
      {uid: 'u-real-1', habitId: 'c', icon: 'water', frequencyType: 'daily', days: [], reminderTime: null, source: 'user',
        createdAt: at('2026-10-01', 9), deleted: true, serverUpdatedMs: at('2026-10-20', 9)},
      // u-real-2: one star habit (Not counted), created on DAY
      {uid: 'u-real-2', habitId: 'd', icon: 'star', frequencyType: 'daily', days: [], reminderTime: null, source: 'user',
        createdAt: at('2026-11-09', 8), deleted: false, serverUpdatedMs: at('2026-11-09', 8)},
      // u-test-1: one daily heart habit created with the clock AHEAD (S-2): createdAt is 3 days in the future
      {uid: 'u-test-1', habitId: 'e', icon: 'heart', frequencyType: 'daily', days: [], reminderTime: '21:00', source: 'user',
        createdAt: at('2026-11-13', 9), deleted: false, serverUpdatedMs: at('2026-11-03', 9)},
    ],
    completions: [
      {uid: 'u-real-1', habitId: 'a', date: '2026-11-09', completed: 1, serverUpdatedMs: at('2026-11-09', 7)},
      {uid: 'u-real-1', habitId: 'b', date: '2026-11-09', completed: 0, serverUpdatedMs: at('2026-11-09', 21)},// unticked
      {uid: 'u-real-1', habitId: 'c', date: '2026-11-09', completed: 1, serverUpdatedMs: at('2026-11-09', 7)},// deleted habit
      {uid: 'u-real-1', habitId: 'a', date: '2026-11-05', completed: 1, serverUpdatedMs: at('2026-11-05', 7)},
      {uid: 'u-test-1', habitId: 'e', date: '2026-11-09', completed: 1, serverUpdatedMs: at('2026-11-09', 22)},
    ],
    aiDaily: {'2026-11-09': 5},
    aiUsage: [
      {uid: 'u-real-1', day: '2026-11-09', attempts: 2},
      {uid: 'u-test-1', day: '2026-11-09', attempts: 3},
    ],
  };
}

describe('computeDayStats', () => {
  const stats = agg.computeDayStats(fixture(), DAY, NOW);

  test('shape: version, day, and both sections', () => {
    assert.equal(stats.version, agg.STATS_VERSION);
    assert.equal(stats.day, DAY);
    assert.deepEqual(Object.keys(stats).sort(), ['all', 'day', 'real', 'version']);
  });

  test('accounts that existed by the end of the day, with and without test accounts', () => {
    assert.equal(stats.all.accounts, 3);// u-empty signed up after DAY
    assert.equal(stats.real.accounts, 2);
  });

  test('active users: opened (Auth last refresh) and logged (serverUpdatedAt), day and week', () => {
    // opened since 00:00 on DAY: u-real-1 (20:00 on DAY) and u-test-1 (today); since Tue 3 Nov: + u-real-2
    assert.deepEqual(stats.all.activeUsers, {loggedDay: 3, loggedWeek: 3, openedDay: 2, openedWeek: 3});
    assert.deepEqual(stats.real.activeUsers, {loggedDay: 2, loggedWeek: 2, openedDay: 1, openedWeek: 2});
  });

  test('"opened" is left out (not null) for days too old to measure, so a merge keeps an earlier value', () => {
    const old = agg.computeDayStats(fixture(), '2026-11-01', NOW);
    assert.equal('openedDay' in old.all.activeUsers, false);
    assert.equal('openedWeek' in old.real.activeUsers, false);
    assert.equal(typeof old.all.activeUsers.loggedDay, 'number');
  });

  test('sign-ups: the day and 13 Monday-start weeks ending with the day\'s week', () => {
    assert.equal(stats.all.signups.day, 1);// u-real-2
    const weeks = stats.all.signups.perWeek;
    assert.equal(weeks.length, agg.SIGNUP_WEEKS);
    assert.equal(weeks.at(-1)!.weekStart, '2026-11-09');// DAY is a Monday
    assert.equal(weeks.at(-1)!.count, 1);// u-real-2 (u-empty is after DAY)
    assert.equal(weeks.at(-2)!.weekStart, '2026-11-02');
    assert.equal(weeks.at(-2)!.count, 1);// u-test-1
    assert.equal(weeks.find((w: {weekStart: string}) => w.weekStart === '2026-09-28')!.count, 1);// u-real-1, Thu 1 Oct
    assert.equal(stats.real.signups.perWeek.at(-2)!.count, 0);
  });

  test('completion rate rebuilt from schedules: deleted habits out, unticked rows not done, S-2 clamp', () => {
    // u-real-1 Monday: a (daily) done, b (mon/wed) unticked; c deleted. u-real-2: d created on DAY, not done.
    // u-test-1: e created "13 Nov" (clock ahead) is clamped to TODAY (10 Nov), so NOT scheduled on 9 Nov.
    assert.deepEqual(stats.real.completion, {scheduled: 3, done: 1});
    assert.deepEqual(stats.all.completion, {scheduled: 3, done: 1});
    // today the clamped habit counts (S-2: counts from today)
    const today = agg.computeDayStats(fixture(), '2026-11-10', NOW);
    assert.deepEqual(today.all.completion, {scheduled: 3, done: 0});// a, d, e (b is mon/wed; Tue)
    assert.deepEqual(today.real.completion, {scheduled: 2, done: 0});
  });

  test('a habit created after the reported day is not scheduled on it (backfill)', () => {
    const before = agg.computeDayStats(fixture(), '2026-11-08', NOW);
    assert.deepEqual(before.real.completion, {scheduled: 1, done: 0});// Sunday: only a (d is created 9 Nov)
  });

  test('habit composition: active habits only, by icon area, source, frequency, reminders, per user', () => {
    assert.deepEqual(stats.real.habits, {
      total: 3,
      byArea: {Learning: 1, Mind: 0, Career: 0, Discipline: 0, Relations: 0, Health: 1, none: 1},
      source: {user: 2, ai_suggested: 1, other: 0},
      frequency: {daily: 2, weekdays: 1},
      withReminder: 1,
      perUser: {'0': 0, '1': 1, '2': 1, '3': 0, '4': 0, '5': 0, '6-9': 0, '10+': 0},
    });
    assert.equal(stats.all.habits.total, 4);
    assert.equal(stats.all.habits.byArea.Relations, 1);
    assert.equal(stats.all.habits.withReminder, 2);
  });

  test('accounts with no habits land in the 0 bucket', () => {
    const today = agg.computeDayStats(fixture(), '2026-11-10', NOW);
    assert.equal(today.all.habits.perUser['0'], 1);// u-empty
  });

  test('AI insights: all accounts from aiUsageDaily, real ones minus the test accounts\' attempts that day', () => {
    assert.deepEqual(stats.all.aiInsights, {modelCalls: 5});
    assert.deepEqual(stats.real.aiInsights, {modelCalls: 2});
    assert.deepEqual(agg.computeDayStats(fixture(), '2026-11-08', NOW).all.aiInsights, {modelCalls: 0});
  });

  test('test-account exclusion: real equals all when the test accounts are removed from the input', () => {
    const input = fixture();
    const noTest = {
      ...input,
      authUsers: input.authUsers.filter((u) => u.uid !== 'u-test-1'),
      habits: input.habits.filter((h) => h.uid !== 'u-test-1'),
      completions: input.completions.filter((c) => c.uid !== 'u-test-1'),
      aiUsage: input.aiUsage.filter((u) => u.uid !== 'u-test-1'),
      aiDaily: {'2026-11-09': 2},
      testUids: [],
    };
    const real = agg.computeDayStats(input, DAY, NOW).real;
    const all = agg.computeDayStats(noTest, DAY, NOW).all;
    assert.deepEqual(real, all);
  });

  test('privacy: no uid, habit id, icon name or reminder time appears anywhere in the output', () => {
    const text = JSON.stringify(stats);
    for (const secret of ['u-real-1', 'u-real-2', 'u-test-1', 'u-empty', '07:30', '21:00', '"a"', 'run', 'book', 'star']) {
      assert.equal(text.includes(secret), false, secret);
    }
  });

  test('bad input: an invalid day throws; junk rows are tolerated', () => {
    assert.throws(() => agg.computeDayStats(fixture(), '9 Nov', NOW));
    const junk = agg.computeDayStats({
      authUsers: [{uid: 'x', createdMs: NaN, lastRefreshMs: 'soon'}],
      habits: [{uid: 'x', habitId: 'h', icon: 7, frequencyType: 'weekdays', days: 'mon', createdAt: 'yesterday', deleted: 'no'}],
      completions: [{uid: 'x', habitId: 'h', date: 20261109, completed: 'yes'}],
    }, DAY, NOW);
    assert.equal(junk.all.accounts, 1);
    assert.deepEqual(junk.all.completion, {scheduled: 0, done: 0});
    assert.equal(junk.all.habits.byArea.none, 1);
  });

  test('empty input gives zeros, not errors', () => {
    const empty = agg.computeDayStats({}, DAY, NOW);
    assert.equal(empty.all.accounts, 0);
    assert.deepEqual(empty.real.completion, {scheduled: 0, done: 0});
    assert.equal(empty.all.signups.perWeek.length, agg.SIGNUP_WEEKS);
  });
});

describe('Nairobi dates and windows', () => {
  test('00:00-03:00 Nairobi is still the previous UTC date but the Nairobi date is the new one', () => {
    assert.equal(agg.nairobiDateOf(Date.UTC(2026, 10, 9, 22, 30)), '2026-11-10');// 01:30 Nairobi
    assert.equal(agg.nairobiDateOf(Date.UTC(2026, 10, 9, 20, 59)), '2026-11-09');// 23:59 Nairobi
    assert.equal(agg.nairobiDayStartMs('2026-11-10'), Date.UTC(2026, 10, 9, 21, 0));
  });

  test('completionWindowStart: a week before the oldest day', () => {
    assert.equal(agg.completionWindowStart(['2026-11-09']), '2026-11-02');
    assert.equal(agg.completionWindowStart(['2026-11-10', '2026-10-31', '2026-11-05']), '2026-10-24');
  });

  test('refreshDays: today and the days before it, clamped to 1..30', () => {
    assert.deepEqual(agg.refreshDays(undefined, NOW), ['2026-11-10']);
    assert.deepEqual(agg.refreshDays(3, NOW), ['2026-11-08', '2026-11-09', '2026-11-10']);
    assert.equal(agg.refreshDays(500, NOW).length, agg.MAX_REFRESH_DAYS);
    assert.deepEqual(agg.refreshDays(0, NOW), ['2026-11-10']);
    assert.deepEqual(agg.refreshDays('7', NOW), ['2026-11-10']);
  });

  test('refreshAllowed: once a minute; a missing or future lastAt never blocks for ever', () => {
    assert.equal(agg.refreshAllowed(null, NOW), true);
    assert.equal(agg.refreshAllowed(NOW - 30_000, NOW), false);
    assert.equal(agg.refreshAllowed(NOW - 60_000, NOW), true);
    assert.equal(agg.refreshAllowed(NOW + 3_600_000, NOW), true);// server clock moved back: don't lock out
    assert.equal(agg.refreshAllowed('x', NOW), true);
  });
});

// ---------- loader, against a fake Admin SDK ----------

type FakeDoc = {id: string; path: string; data: Record<string, unknown>};

function fakeSdk(docs: FakeDoc[], authPages: {uid: string; metadata: Record<string, string | null>}[][]) {
  const selects: Record<string, string[]> = {};
  const wheres: unknown[][] = [];
  const snapOf = (d: FakeDoc) => {
    const parts = d.path.split('/');// users/{uid}/habits/{id}: collection, its parent doc, that doc's collection
    return {
      id: d.id,
      exists: true,
      ref: {parent: {id: parts.at(-2), parent: {id: parts.at(-3), parent: {id: parts.at(-4)}}}},
      get: (field: string) => d.data[field],
    };
  };
  const query = (name: string, group: boolean) => {
    const matches = (d: FakeDoc) => {
      const parts = d.path.split('/');
      return group ? parts.at(-2) === name : parts.length === 2 && parts[0] === name;
    };
    let filters: [string, string, string][] = [];
    const q = {
      select: (...fields: string[]) => {
        selects[name] = fields;
        return q;
      },
      where: (f: string, op: string, v: string) => {
        filters = [...filters, [f, op, v]];
        wheres.push([name, f, op, v]);
        return q;
      },
      get: async () => ({
        docs: docs.filter(matches).filter((d) => filters.every(([f, op, v]) => {
          const x = d.data[f] as string;
          return op === '>=' ? x >= v : x <= v;
        })).map(snapOf),
      }),
      doc: (id: string) => ({id, name}),
    };
    return q;
  };
  const db = {
    collection: (name: string) => query(name, false),
    collectionGroup: (name: string) => query(name, true),
    getAll: async (...refs: {id: string; name: string}[]) => refs.map((r) => {
      const d = docs.find((x) => x.path === `${r.name}/${r.id}`);
      return d ? {...snapOf(d), exists: true} : {id: r.id, exists: false, get: () => undefined};
    }),
  };
  let call = 0;
  const auth = {
    listUsers: async () => {
      const users = authPages[call] ?? [];
      call += 1;
      return {users, pageToken: call < authPages.length ? `p${call}` : undefined};
    },
  };
  return {db, auth, selects, wheres};
}

describe('loadStatsInput', () => {
  const ts = (ms: number) => ({toMillis: () => ms});
  const docs: FakeDoc[] = [
    {id: 'u1', path: 'users/u1', data: {test: true, firstName: 'Secret'}},
    {id: 'u2', path: 'users/u2', data: {}},
    {id: 'h1', path: 'users/u1/habits/h1', data: {icon: 'run', frequencyType: 'daily', days: [], createdAt: 5, deleted: false,
      source: 'user', reminderTime: null, serverUpdatedAt: ts(9)}},
    {id: 'h2', path: 'other/u9/habits/h2', data: {icon: 'run'}},// not under users/: ignored
    {id: 'h1_2026-11-09', path: 'users/u1/completions/h1_2026-11-09',
      data: {habitId: 'h1', date: '2026-11-09', completed: 1, serverUpdatedAt: ts(10)}},
    {id: 'h1_2026-10-01', path: 'users/u1/completions/h1_2026-10-01',
      data: {habitId: 'h1', date: '2026-10-01', completed: 1, serverUpdatedAt: ts(11)}},// before the window
    {id: 'u1', path: 'aiUsage/u1', data: {day: '2026-11-09', attempts: 1}},
    {id: '2026-11-09', path: 'aiUsageDaily/2026-11-09', data: {count: 4}},
  ];
  const pages = [
    [{uid: 'u1', metadata: {creationTime: 'Mon, 02 Nov 2026 06:00:00 GMT', lastRefreshTime: null}}],
    [{uid: 'u2', metadata: {creationTime: 'Tue, 03 Nov 2026 06:00:00 GMT', lastRefreshTime: 'Mon, 09 Nov 2026 06:00:00 GMT'}}],
  ];

  test('maps Firestore and Auth to aggregate rows, pages through Auth, filters completions by date', async () => {
    const sdk = fakeSdk(docs, pages);
    const input = await loadStatsInput(sdk, ['2026-11-09']);
    assert.deepEqual(input.authUsers.map((u: {uid: string}) => u.uid), ['u1', 'u2']);
    assert.equal(input.authUsers[0].lastRefreshMs, null);
    assert.equal(input.authUsers[1].lastRefreshMs, Date.UTC(2026, 10, 9, 6));
    assert.deepEqual(input.testUids, ['u1']);
    assert.equal(input.habits.length, 1);
    assert.equal(input.habits[0].uid, 'u1');
    assert.equal(input.habits[0].serverUpdatedMs, 9);
    assert.deepEqual(input.completions.map((c: {date: string}) => c.date), ['2026-11-09']);
    assert.deepEqual(input.aiDaily, {'2026-11-09': 4});
    assert.deepEqual(sdk.wheres, [['completions', 'date', '>=', '2026-11-02'], ['completions', 'date', '<=', '2026-11-09']]);
  });

  test('field masks never ask for names, ages, habit names or emails', async () => {
    const sdk = fakeSdk(docs, pages);
    await loadStatsInput(sdk, ['2026-11-09']);
    const asked = Object.values(sdk.selects).flat();
    for (const field of ['habitName', 'firstName', 'lastName', 'age', 'email']) assert.equal(asked.includes(field), false, field);
    assert.deepEqual(sdk.selects.users, ['test']);
  });

  test('the loader output feeds computeDayStats end to end', async () => {
    const input = await loadStatsInput(fakeSdk(docs, pages), ['2026-11-09']);
    const out = agg.computeDayStats(input, '2026-11-09', NOW);
    assert.equal(out.all.accounts, 2);
    assert.equal(out.real.accounts, 1);// u1 is a test account
    assert.deepEqual(out.all.completion, {scheduled: 1, done: 1});
    assert.deepEqual(out.real.completion, {scheduled: 0, done: 0});
  });
});
