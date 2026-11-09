// Property tests over the pure cores (docs/TEST_STRATEGY.md, Part C): invariants checked over the whole input
// domain or over seeded random inputs, not just the spec's examples. A failure names its seed; replay one with
// HQ_SEED=<seed>, run more with HQ_RUNS=<n>. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {forEachSeed, type Rng} from './helpers/prng.ts';
import type {GamiCompletion, GamiHabit, GamiReflection} from '../utils/gamification.ts';
import type {DayCount} from '../utils/dailyCompletion.ts';
import type {RadarHabit} from '../utils/radar/score.ts';
import type {AreasMap} from '../utils/radar/areas.ts';
import type {WeekdayKey} from '../constants/habits.ts';

const L = await import('../utils/packs/limits.ts');
const G = await import('../utils/gamification.ts');
const {computeVitality, VITALITY_MAX} = await import('../utils/vitality.ts');
const {dailyCompletion} = await import('../utils/dailyCompletion.ts');
const {computeRadar} = await import('../utils/radar/score.ts');
const {AXES} = await import('../utils/onboarding/types.ts');

const TODAY = '2026-11-09';
const TODAY_N = G.toDayNumber(TODAY);
const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ICONS = ['book', 'water', 'run', 'meditate', 'sleep', 'food', 'study', 'work', 'music', 'money', 'heart', 'star'];

// ---------- Random accounts ----------

const habitId = (i: number) => `h${String(i).padStart(3, '0')}`;

function randomHabits(rng: Rng, max = 8): RadarHabit[] {
  return Array.from({length: rng.int(0, max)}, (_, i) => {
    const weekdays = rng.bool(0.3);
    return {
      habitId: habitId(i),
      createdDate: G.fromDayNumber(TODAY_N - rng.int(-2, 60)),// a few created "in the future" (clock ahead)
      frequencyType: weekdays ? 'weekdays' : 'daily',
      days: weekdays ? rng.shuffle(WEEKDAYS).slice(0, rng.int(1, 3)) : [],
      deleted: rng.bool(0.15),
      icon: rng.pick(ICONS),
    };
  });
}

function randomCompletions(rng: Rng, habits: readonly GamiHabit[]): GamiCompletion[] {
  const out: GamiCompletion[] = [];
  for (const h of habits) {
    for (let n = TODAY_N - 62; n <= TODAY_N + 2; n++) {// a couple of future-dated rows too
      if (rng.bool(0.4)) out.push({habitId: h.habitId, date: G.fromDayNumber(n), completed: rng.bool(0.75)});
    }
  }
  return out;
}

function randomReflections(rng: Rng, completions: readonly GamiCompletion[]): GamiReflection[] {
  return completions.filter(() => rng.bool(0.2)).map((c) => ({habitId: c.habitId, date: c.date, savedAt: rng.int(1, 1e6)}));
}

// ---------- L2: the level named in a limit message ----------

describe('L2: the limit message names the lowest level that actually gives room', () => {
  test('levels 1-20 x counts 0-60, habits and packs', () => {
    for (const kind of ['habits', 'packs'] as const) {
      for (let level = 1; level <= 20; level++) {
        for (let count = 0; count <= 60; count++) {
          const next = L.nextLimitLevel(level, kind, count);
          const needed = Math.max(L.limitsForLevel(level)[kind], count);
          const where = `${kind} level ${level} count ${count} -> ${next}`;
          assert.ok(next > level, where);
          assert.ok(L.limitsForLevel(next)[kind] > needed, `${where}: that level still has no room`);
          for (let lower = level + 1; lower < next; lower++) {
            assert.ok(L.limitsForLevel(lower)[kind] <= needed, `${where}: level ${lower} already gives room`);
          }
          assert.match(L.limitMessageFor(kind, level, count), new RegExp(`level ${next} `), where);
        }
      }
    }
  });

  test('checkAdd refuses exactly when the room is smaller than what is being added, and only adding is checked', () => {
    for (const kind of ['habits', 'packs'] as const) {
      for (let level = 1; level <= 20; level++) {
        for (let count = 0; count <= 60; count++) {
          for (const adding of [1, 2, 5]) {
            const room = Math.max(0, L.limitsForLevel(level)[kind] - count);
            const check = L.checkAdd({level, kind, count, adding});
            assert.equal(check.room, room);
            assert.equal(check.ok, room >= adding, `${kind} ${level}/${count}/${adding}`);
          }
        }
      }
    }
  });
});

// ---------- X1: XP is a pure function of the rows ----------

describe('X1: XP and level are order-independent and un-tick then re-tick restores them', () => {
  test('shuffled habits, completions and reflections give identical stats', () => {
    forEachSeed(150, (rng) => {
      const habits = randomHabits(rng);
      const completions = randomCompletions(rng, habits);
      const reflections = randomReflections(rng, completions);
      const base = G.computeGamification(habits, completions, TODAY, reflections);
      const shuffled = G.computeGamification(rng.shuffle(habits), rng.shuffle(completions), TODAY, rng.shuffle(reflections));
      assert.deepEqual(shuffled, base);
    });
  });

  test('un-ticking a completion and ticking it again gives the same stats; un-ticking never adds XP', () => {
    forEachSeed(150, (rng) => {
      const habits = randomHabits(rng);
      const completions = randomCompletions(rng, habits);
      const reflections = randomReflections(rng, completions);
      const ticked = completions.map((c, i) => [c, i] as const).filter(([c]) => c.completed);
      if (ticked.length === 0) return;
      const [, index] = rng.pick(ticked);
      const base = G.computeGamification(habits, completions, TODAY, reflections);
      const unticked = completions.map((c, i) => (i === index ? {...c, completed: false} : c));
      const after = G.computeGamification(habits, unticked, TODAY, reflections);
      assert.ok(after.totalXp <= base.totalXp, 'un-ticking added XP');
      const reticked = unticked.map((c, i) => (i === index ? {...c, completed: true} : c));
      assert.deepEqual(G.computeGamification(habits, reticked, TODAY, reflections), base);
    });
  });

  test('the level follows 50 x L x (L - 1) and never falls as XP grows', () => {
    let previous = 1;
    for (let xp = 0; xp <= 60_000; xp += 7) {
      const {level, xpIntoLevel, xpForNextLevel, progress} = G.levelFromXp(xp);
      assert.ok(level >= previous, `xp ${xp}`);
      assert.ok(G.xpToReachLevel(level) <= xp && xp < G.xpToReachLevel(level + 1), `xp ${xp} level ${level}`);
      assert.equal(xpForNextLevel, 100 * level);
      assert.ok(xpIntoLevel >= 0 && progress >= 0 && progress < 1);
      previous = level;
    }
  });

  test('reflection XP: at most 3 a day, one per habit per day, only while that day is ticked', () => {
    let capReached = 0;
    forEachSeed(150, (rng) => {
      const habits = randomHabits(rng, 10);
      const completions = randomCompletions(rng, habits);
      // dense: most completions reflected on, some twice, so days with more than 3 candidates are common
      const reflections = [...randomReflections(rng, completions), ...completions.filter(() => rng.bool(0.6))
        .map((c) => ({habitId: c.habitId, date: c.date, savedAt: rng.int(1, 1e6)}))];
      const rewarded = G.rewardedReflections(reflections, completions, TODAY);
      const ticked = new Set(completions.filter((c) => c.completed && c.date <= TODAY).map((c) => `${c.habitId}|${c.date}`));
      const perDay = new Map<string, number>();
      const seen = new Set<string>();
      for (const r of rewarded) {
        assert.ok(ticked.has(`${r.habitId}|${r.date}`), 'rewarded without a tick');
        assert.ok(!seen.has(`${r.habitId}|${r.date}`), 'two rewards for one habit and day');
        seen.add(`${r.habitId}|${r.date}`);
        perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
      }
      for (const n of perDay.values()) assert.ok(n <= G.MAX_REWARDED_REFLECTIONS_PER_DAY);
      if ([...perDay.values()].includes(G.MAX_REWARDED_REFLECTIONS_PER_DAY)) capReached += 1;
    });
    assert.ok(capReached > 0, 'no seed reached the daily cap, so the cap was never tested');
  });
});

// ---------- V1: Vitality bounds ----------

describe('V1: Vitality stays in bounds and never shows today\'s loss', () => {
  const randomDays = (rng: Rng): {closed: DayCount[]; today: DayCount | null} => {
    const closed = Array.from({length: rng.int(0, 120)}, (_, i) => {
      const scheduled = rng.bool(0.15) ? 0 : rng.int(1, 12);
      return {date: G.fromDayNumber(TODAY_N - 200 + i), scheduled, done: rng.int(0, scheduled)};
    });
    const scheduled = rng.int(0, 12);
    return {closed, today: scheduled > 0 ? {date: TODAY, scheduled, done: rng.int(0, scheduled)} : null};
  };

  test('0..100, starting exactly when no scheduled day has closed, shown = closed + today\'s gain only', () => {
    forEachSeed(300, (rng) => {
      const days = randomDays(rng);
      const v = computeVitality(days);
      const anyClosed = days.closed.some((d) => d.scheduled > 0);
      assert.equal(v.state === 'starting', !anyClosed);
      if (v.state !== 'ready') return;
      for (const value of [v.value, v.closedValue]) assert.ok(Number.isInteger(value) && value >= 0 && value <= VITALITY_MAX);
      assert.ok(v.value >= v.closedValue, 'today\'s loss was shown');
      assert.ok(v.value - v.closedValue <= 6, 'today added more than a full day');
    });
  });

  test('through the real per-day counts: the same bounds for random accounts', () => {
    forEachSeed(150, (rng) => {
      const habits = randomHabits(rng);
      const v = computeVitality(dailyCompletion(habits, randomCompletions(rng, habits), TODAY));
      if (v.state === 'ready') assert.ok(v.value >= v.closedValue && v.value >= 0 && v.value <= VITALITY_MAX);
    });
  });
});

// ---------- R1: radar bounds and states ----------

describe('R1: radar axes are in bounds and their states agree with the habits', () => {
  test('shares in [0, 1], done <= scheduled, empty exactly when no habit is in the area, month covers week', () => {
    forEachSeed(150, (rng) => {
      const habits = randomHabits(rng);
      const completions = randomCompletions(rng, habits);
      const areas: AreasMap = Object.fromEntries(habits.filter(() => rng.bool(0.3)).map((h) => [h.habitId, rng.pick([...AXES, 'none' as const])]));
      const radar = computeRadar({habits, completions, today: TODAY, packs: null, areas});
      const inArea = (axis: string) => habits.some((h) => {
        if (h.deleted) return false;
        const stored = areas[h.habitId];
        const area = stored ?? ({run: 'Health', water: 'Health', food: 'Health', sleep: 'Health', meditate: 'Mind', music: 'Mind',
          work: 'Career', money: 'Career', book: 'Learning', study: 'Learning', heart: 'Relations'} as Record<string, string>)[h.icon] ?? 'none';
        return area === axis;
      });
      for (const window of [radar.week, radar.month]) {
        assert.deepEqual(window.axes.map((a) => a.axis), [...AXES]);
        assert.equal(window.starting, window.axes.every((a) => a.state !== 'score'));
        for (const a of window.axes) {
          assert.equal(a.state === 'empty', !inArea(a.axis), `${window.window} ${a.axis}`);
          if (a.state !== 'score') continue;
          assert.ok(a.scheduled > 0 && a.done >= 0 && a.done <= a.scheduled);
          assert.ok(a.share >= 0 && a.share <= 1 && a.percent === Math.round(a.share * 100));
        }
      }
      radar.week.axes.forEach((w, i) => {
        const m = radar.month.axes[i];
        if (w.state === 'score') assert.ok(m.state === 'score' && m.scheduled >= w.scheduled && m.done >= w.done);
      });
    });
  });

  test('today never counts: ticking or un-ticking today changes no radar value', () => {
    forEachSeed(100, (rng) => {
      const habits = randomHabits(rng);
      const completions = randomCompletions(rng, habits).filter((c) => c.date !== TODAY);
      const withToday = [...completions, ...habits.map((h) => ({habitId: h.habitId, date: TODAY, completed: true}))];
      const input = {habits, today: TODAY, packs: null, areas: {}};
      assert.deepEqual(computeRadar({...input, completions: withToday}), computeRadar({...input, completions}));
    });
  });
});
