// C4 timing fix: utils/awards.ts computes the award metrics from one shared day table and reuses the longest streak and
// perfect-day count of the XP code. This checks the new code against the first implementation (kept, test-only, in
// tests/helpers/awards-reference.ts) on many random fixtures: deleted habits, weekday schedules, today open or ticked,
// habits created in the future (the S-2 clamp), un-ticked and future rows, and the empty account. XP and level come
// from utils/gamification.ts, which this change does not touch.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createRng} from './helpers/prng.ts';

const awards = await import('../utils/awards.ts');
const gami = await import('../utils/gamification.ts');
const {referenceAwardMetrics, referenceAwards} = await import('./helpers/awards-reference.ts');

type Habit = import('../utils/radar/score.ts').RadarHabit;
type Completion = import('../utils/gamification.ts').GamiCompletion;
type WeekdayKey = import('../constants/habits.ts').WeekdayKey;

const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ICONS = ['run', 'water', 'book', 'meditate', 'work', 'heart', 'checklist', 'yoga', 'star', 'trophy', 'zz_test_unknown'];

function fixture(seed: number): {habits: Habit[]; completions: Completion[]; today: string} {
  const random = createRng(seed);
  const rng = () => random.next();
  const int = (lo: number, hi: number) => random.int(lo, hi);
  const today = gami.fromDayNumber(gami.toDayNumber('2026-11-15') - int(0, 6));// any weekday
  const T = gami.toDayNumber(today);
  const span = int(0, 400);
  const habits: Habit[] = Array.from({length: int(0, 9)}, (_, i) => {
    const weekdays = rng() < 0.4;
    const days = weekdays ? WEEKDAYS.filter(() => rng() < 0.5) : [];
    return {
      habitId: `h${i}`,
      createdDate: gami.fromDayNumber(T - int(-3, span)),// a few created "in the future" (S-2)
      frequencyType: weekdays && days.length > 0 ? 'weekdays' : 'daily',
      days: weekdays && days.length > 0 ? days : [],
      deleted: rng() < 0.15,
      icon: ICONS[int(0, ICONS.length - 1)],
    };
  });
  const completions: Completion[] = [];
  const share = rng();// how busy this account is
  for (const h of habits) {
    for (let n = T - span - 2; n <= T + 1; n++) {
      if (rng() < share) completions.push({habitId: h.habitId, date: gami.fromDayNumber(n), completed: rng() < 0.9});
    }
  }
  return {habits, completions, today};
}

describe('the faster award metrics match the first implementation', () => {
  test('300 random accounts: the same metrics and the same award states, with and without the XP code\'s numbers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const {habits, completions, today} = fixture(seed);
      const reference = referenceAwardMetrics(habits, completions, today);
      assert.deepEqual(awards.awardMetrics(habits, completions, today), reference, `seed ${seed}`);
      const xp = gami.computeGamification(habits, completions, today);
      const known = {longestStreak: xp.longestStreak, perfectDays: xp.perfectDays};
      assert.deepEqual(awards.awardMetrics(habits, completions, today, known), reference, `seed ${seed} (known)`);
      assert.deepEqual(awards.computeAwards(habits, completions, today, known), referenceAwards(habits, completions, today), `seed ${seed}`);
    }
  });

  test('the XP code\'s longest streak and perfect days are the numbers the awards would compute', () => {
    for (let seed = 301; seed <= 400; seed++) {
      const {habits, completions, today} = fixture(seed);
      const xp = gami.computeGamification(habits, completions, today);
      const own = awards.awardMetrics(habits, completions, today);
      assert.deepEqual([xp.longestStreak, xp.perfectDays], [own.longestStreak, own.perfectDays], `seed ${seed}`);
    }
  });

  test('the empty account, an account with habits and no ticks, and today open or ticked', () => {
    const today = '2026-11-15';
    const habit = (id: string, created: string): Habit => ({habitId: id, createdDate: created, frequencyType: 'daily', days: [], deleted: false, icon: 'book'});
    const cases: [Habit[], Completion[]][] = [
      [[], []],
      [[habit('a', '2026-10-01')], []],
      [[habit('a', '2026-10-01')], [{habitId: 'a', date: '2026-11-14', completed: true}]],
      [[habit('a', '2026-10-01')], [{habitId: 'a', date: '2026-11-15', completed: true}]],
      [[habit('a', '2026-11-20')], [{habitId: 'a', date: '2026-11-15', completed: true}]],
    ];
    for (const [habits, completions] of cases) {
      assert.deepEqual(awards.computeAwards(habits, completions, today), referenceAwards(habits, completions, today));
    }
  });

  test('the reference is test-only: nothing in the app imports it', async () => {
    const {readFileSync, readdirSync, statSync} = await import('node:fs');
    const {join} = await import('node:path');
    const root = new URL('../', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
    const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((name) => {
      const rel = `${dir}/${name}`;
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(tsx?|js)$/.test(rel) ? [rel] : [];
    });
    for (const file of ['app', 'components', 'hooks', 'services', 'utils'].flatMap(walk)) {
      assert.doesNotMatch(readFileSync(join(root, file), 'utf8').replace(/\/\/.*$/gm, ''), /awards-reference/, file);// code, not comments
    }
  });
});
