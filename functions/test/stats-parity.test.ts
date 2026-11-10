// Parity: the copies in functions/src/stats/aggregate.js must agree with the app's own rules on random data.
//   scheduling + S-2 clamp + per-day counts  vs  utils/dailyCompletion.ts (which uses utils/gamification.ts)
//   isScheduledOn, calendar stepping         vs  utils/gamification.ts
//   ICON_AREA / iconArea                     vs  utils/radar/areas.ts (every icon id, plus unknown ones)
//   AREAS                                    vs  AXES in utils/onboarding/types.ts
// If one of these fails, the app's rule changed: update the copy in aggregate.js (and its header) to match.
// Run: cd functions && npm test
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import '../../tests/helpers/alias.ts';// must come before the dynamic imports below
import {createRng} from '../../tests/helpers/prng.ts';

const server = await import('../src/stats/aggregate.js');
const {dailyCompletion} = await import('../../utils/dailyCompletion.ts');
const gami = await import('../../utils/gamification.ts');
const appAreas = await import('../../utils/radar/areas.ts');
const {ICON_IDS, WEEKDAY_KEYS} = await import('../../constants/habits.ts');
const {AXES} = await import('../../utils/onboarding/types.ts');

const TODAY = '2026-11-10';
const SEEDS = Array.from({length: 200}, (_, i) => 1000 + i);

type Habit = {habitId: string; createdDate: string; frequencyType: 'daily' | 'weekdays'; days: string[]; deleted: boolean};
type Completion = {habitId: string; date: string; completed: boolean};

function randomUser(seed: number) {
  const rng = createRng(seed);
  const habits: Habit[] = Array.from({length: rng.int(0, 6)}, (_, i) => {
    const weekdays = rng.bool();
    return {
      habitId: `h${i}`,
      // up to 60 days back, and sometimes AFTER today (clock ahead, S-2)
      createdDate: server.addDays(TODAY, rng.int(-60, rng.bool(0.15) ? 5 : 0)),
      frequencyType: weekdays ? 'weekdays' : 'daily',
      days: weekdays ? rng.shuffle(WEEKDAY_KEYS).slice(0, rng.int(1, 7)) : [],
      deleted: rng.bool(0.15),
    };
  });
  const completions: Completion[] = [];
  for (const h of habits) {
    for (let back = -3; back <= 65; back++) {// a few future-dated rows too
      if (rng.bool(0.5)) completions.push({habitId: h.habitId, date: server.addDays(TODAY, -back), completed: rng.bool(0.8)});
    }
  }
  // a completion of a habit that isn't there (deleted elsewhere / not pulled)
  if (rng.bool(0.2)) completions.push({habitId: 'ghost', date: server.addDays(TODAY, -1), completed: true});
  return {habits, completions};
}

describe('stats parity with the app', () => {
  test('per-day scheduled and done match utils/dailyCompletion.ts on 200 random users', () => {
    for (const seed of SEEDS) {
      const {habits, completions} = randomUser(seed);
      const app = dailyCompletion(habits as never, completions, TODAY);
      const appDays = [...app.closed, ...(app.today ? [app.today] : [])];
      const serverDays = server.dayCounts(habits, completions, appDays.map((d) => d.date), TODAY);
      assert.deepEqual(serverDays, appDays, `seed ${seed}`);
      // and every other day in the range is a rest day for the server too
      const listed = new Set(appDays.map((d) => d.date));
      const others = Array.from({length: 70}, (_, i) => server.addDays(TODAY, -i)).filter((d) => !listed.has(d));
      // the app lists every day from its first scheduled day; before that (or a quiet today) nothing is scheduled
      for (const d of server.dayCounts(habits, completions, others, TODAY)) {
        assert.equal(d.scheduled, 0, `seed ${seed} ${d.date}`);
      }
    }
  });

  test('completionActive equals the app\'s per-day counts summed over the accounts active that week', () => {
    const HOUR = 3600 * 1000;
    const DAY = server.addDays(TODAY, -1);// the closed day a nightly run reports
    const now = server.nairobiDayStartMs(TODAY) + 10 * HOUR;
    const weekStart = server.nairobiDayStartMs(server.addDays(DAY, -6));
    const dayEnd = server.nairobiDayStartMs(TODAY);
    let activeSeen = 0;
    let idleSeen = 0;
    let scheduledSeen = 0;
    for (let batch = 0; batch < 40; batch++) {
      const input = {authUsers: [] as object[], habits: [] as object[], completions: [] as object[]};
      let expected = {scheduled: 0, done: 0, accounts: 0};
      for (let u = 0; u < 5; u++) {
        const seed = 5000 + batch * 10 + u;
        const rng = createRng(seed);
        const uid = `user${u}`;
        const {habits, completions} = randomUser(seed);
        // each write lands somewhere in the last 30 days, so some accounts are active that week and some aren't
        const writeAt = () => server.nairobiDayStartMs(server.addDays(TODAY, -rng.int(1, 30))) + rng.int(0, 23) * HOUR;
        let active = false;
        const note = (ms: number) => { if (ms >= weekStart && ms < dayEnd) active = true; return ms; };
        input.authUsers.push({uid, createdMs: now - 60 * 24 * HOUR, lastRefreshMs: null});
        for (const h of habits) {
          input.habits.push({uid, habitId: h.habitId, icon: 'run', frequencyType: h.frequencyType, days: h.days,
            reminderTime: null, source: 'user', deleted: h.deleted, serverUpdatedMs: note(writeAt()),
            createdAt: server.nairobiDayStartMs(h.createdDate) + 9 * HOUR});
        }
        for (const c of completions) {
          input.completions.push({uid, habitId: c.habitId, date: c.date, completed: c.completed ? 1 : 0, serverUpdatedMs: note(writeAt())});
        }
        if (!active) {
          idleSeen += 1;
          continue;
        }
        activeSeen += 1;
        const app = dailyCompletion(habits as never, completions, TODAY);
        const day = app.closed.find((d) => d.date === DAY) ?? {scheduled: 0, done: 0};
        expected = {scheduled: expected.scheduled + day.scheduled, done: expected.done + day.done, accounts: expected.accounts + 1};
      }
      const stats = server.computeDayStats(input, DAY, now);
      assert.deepEqual(stats.all.completionActive, expected, `batch ${batch}`);
      scheduledSeen += expected.scheduled;
    }
    // the random data really covers both kinds of account and real scheduled days
    assert.ok(activeSeen > 20 && idleSeen > 20 && scheduledSeen > 20, `${activeSeen} active, ${idleSeen} idle, ${scheduledSeen} scheduled`);
  });

  test('isScheduledOn and the S-2 clamp match utils/gamification.ts', () => {
    for (const seed of SEEDS) {
      const {habits} = randomUser(seed);
      const clampedApp = gami.clampCreatedDates(habits as never, TODAY);
      habits.forEach((h, i) => {
        const clamped = server.clampCreatedDate(h, TODAY);
        assert.deepEqual(clamped, clampedApp[i], `seed ${seed} clamp`);
        for (let back = -3; back <= 65; back++) {
          const date = server.addDays(TODAY, -back);
          assert.equal(server.isScheduledOn(clamped, date), gami.isScheduledOn(clamped as never, date), `seed ${seed} ${date}`);
        }
      });
    }
  });

  test('calendar stepping matches, across month, year and leap-day boundaries', () => {
    for (const date of ['2024-02-28', '2024-02-29', '2024-03-01', '2025-12-31', '2026-01-01', '2026-11-10']) {
      const n = server.toDayNumber(date);
      assert.equal(n, gami.toDayNumber(date));
      assert.equal(server.fromDayNumber(n), gami.fromDayNumber(n));
      assert.equal(server.weekdayOf(n), gami.weekdayOf(n));
      assert.equal(server.fromDayNumber(n + 1), gami.fromDayNumber(n + 1));
    }
  });

  test('icon areas match utils/radar/areas.ts for every icon, and unknown icons are Not counted', () => {
    assert.deepEqual({...server.ICON_AREA}, {...appAreas.ICON_AREA});
    for (const icon of [...ICON_IDS, 'unknown', '']) {
      assert.equal(server.iconArea(icon), appAreas.iconArea(icon), icon);
    }
    // server only: Firestore data could hold any string; a prototype name must never read as an area
    for (const icon of ['constructor', '__proto__', 'toString']) assert.equal(server.iconArea(icon), 'none', icon);
  });

  test('the area list is the app axes plus none', () => {
    assert.deepEqual(server.AREAS, [...AXES, 'none']);
  });
});
