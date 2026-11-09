/// <reference types="node" />
// Test-only: named fixture accounts in odd real-world states (docs/TEST_STRATEGY.md, Part E). Each is the rows the
// stats load reads from SQLite (habits with a local createdDate, completions) plus the raw AsyncStorage values kept
// on the phone, so tests run them through the real parsers and pure cores. Deterministic: no clock, no randomness
// except a fixed seed.

import {createRng} from './prng.ts';
import type {GamiCompletion} from '../../utils/gamification.ts';
import type {RadarHabit} from '../../utils/radar/score.ts';
import type {WeekdayKey} from '../../constants/habits.ts';

export const FIXTURE_TODAY = '2026-11-09';// a Monday
const DAY_MS = 86_400_000;
const todayN = Date.UTC(2026, 10, 9) / DAY_MS;

export const dayOffset = (n: number): string => {// n days after FIXTURE_TODAY (negative: before)
  const d = new Date((todayN + n) * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export type FixtureHabit = RadarHabit & {habitName: string};

export type Fixture = {
  name: string;
  story: string;
  uid: string;
  today: string;
  habits: FixtureHabit[];
  completions: GamiCompletion[];
  storage: Record<string, string>;// raw AsyncStorage values, as the phone holds them
};

const TEMPLATE = {
  walk20: 'Walk for 20 minutes', stretch10: 'Stretch for 10 minutes', water_meals: 'Drink water with each meal',
  eat_produce: 'Eat one fruit or vegetable', breathe5: 'Breathe for 5 minutes', journal3: 'Write 3 lines in a journal',
  lights_out: 'Lights out at a set time', screens_off: 'No screens 30 min before bed', plan_top1: "Plan tomorrow's top task",
  make_bed: 'Make your bed', tidy5: 'Tidy your space for 5 minutes', set_out_essentials: "Set out tomorrow's essentials",
} as const;

function habit(habitId: string, habitName: string, over: Partial<FixtureHabit> = {}): FixtureHabit {
  return {habitId, habitName, icon: 'star', createdDate: dayOffset(-30), frequencyType: 'daily', days: [], deleted: false, ...over};
}

// Ticks for these habits on each of the days (offsets from today)
function ticks(habitIds: readonly string[], fromOffset: number, toOffset: number, completed = true): GamiCompletion[] {
  const out: GamiCompletion[] = [];
  for (const habitId of habitIds) {
    for (let n = fromOffset; n <= toOffset; n++) out.push({habitId, date: dayOffset(n), completed});
  }
  return out;
}

const builtin = (id: string, name: string, habitIds: string[], order: number, dropped: string[] = []) =>
  ({id, kind: 'builtin', builtinId: id, name, habitIds, dropped, createdAt: 1_760_000_000_000, order});
const packs = (...list: unknown[]) => JSON.stringify({version: 1, packs: list});
const onboarding = (addedTemplateIds: string[], over: Record<string, unknown> = {}) =>
  JSON.stringify({version: 1, skipped: false, answers: null, completedAt: 1_760_000_000_000, addedTemplateIds, ...over});
const answers = {feel: 'easy', amount: 'all', helped: 'routine', blocker: 'none'};

// ---------- The fixtures ----------

function dupCalmMind(): Fixture {
  const uid = 'uid-dup';
  const habits = [
    habit('c1', TEMPLATE.breathe5, {icon: 'meditate'}), habit('c2', TEMPLATE.journal3, {icon: 'book'}),
    habit('c3', TEMPLATE.lights_out, {icon: 'sleep'}), habit('c4', TEMPLATE.screens_off, {icon: 'sleep'}),
    habit('c5', TEMPLATE.lights_out, {icon: 'sleep', createdDate: dayOffset(-3)}),
    habit('c6', TEMPLATE.screens_off, {icon: 'sleep', createdDate: dayOffset(-3)}),
    habit('s1', TEMPLATE.walk20, {icon: 'run'}),
  ];
  return {
    name: 'dupCalmMind', uid, today: FIXTURE_TODAY, habits,
    story: 'The main account: a retake added lights_out and screens_off again, and Calm Mind holds 6 ids',
    completions: ticks(['c1', 'c2', 'c3', 'c4', 's1'], -20, -1),
    storage: {
      [`packs:v1:${uid}`]: packs(builtin('calm_mind', 'Calm Mind', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], 0),
        builtin('steady_energy', 'Steady Energy', ['s1'], 1)),
      [`onboarding:v1:${uid}`]: onboarding(['breathe5', 'journal3', 'walk20', 'lights_out', 'screens_off']),
    },
  };
}

function overLimitL3(): Fixture {
  const uid = 'uid-over';
  const habits = Array.from({length: 23}, (_, i) => habit(`o${i}`, `Habit ${i}`, {icon: 'run'}));
  return {
    name: 'overLimitL3', uid, today: FIXTURE_TODAY, habits,
    story: '23 active habits at level 3 after the XP rebalance (limit 16), 3 packs at the pack limit',
    completions: ticks(['o0', 'o1', 'o2', 'o3'], -30, -1),// 120 ticks + a 30-day streak: 315 XP, level 3
    storage: {
      [`packs:v1:${uid}`]: packs(builtin('steady_energy', 'Steady Energy', ['o0'], 0), builtin('calm_mind', 'Calm Mind', ['o1'], 1),
        builtin('daily_discipline', 'Daily Discipline', ['o2'], 2)),
    },
  };
}

function recreated(): Fixture {
  const uid = 'uid-recreated';
  const names = Object.values(TEMPLATE).slice(0, 8);
  const old = names.map((n, i) => habit(`old${i}`, n, {icon: 'run', createdDate: dayOffset(-230), deleted: true}));
  const fresh = names.map((n, i) => habit(`new${i}`, n, {icon: 'run', createdDate: FIXTURE_TODAY}));
  return {
    name: 'recreated', uid, today: FIXTURE_TODAY, habits: [...old, ...fresh],
    story: '8 habits deleted after 200 days of history, 8 with the same names created today',
    completions: ticks(old.map((h) => h.habitId), -230, -31),
    storage: {},
  };
}

function clockAhead(): Fixture {
  const uid = 'uid-ahead';
  return {
    name: 'clockAhead', uid, today: FIXTURE_TODAY,
    story: 'A habit created while the clock was 3 days ahead, a tick dated tomorrow, then the clock was fixed',
    habits: [habit('a1', 'Read', {icon: 'book', createdDate: dayOffset(-10)}), habit('a2', 'Run', {icon: 'run', createdDate: dayOffset(3)})],
    completions: [...ticks(['a1'], -10, 0), {habitId: 'a1', date: dayOffset(1), completed: true}, {habitId: 'a2', date: FIXTURE_TODAY, completed: true}],
    storage: {},
  };
}

function pulledFromB(): Fixture {
  const uid = 'uid-pulled';
  return {
    name: 'pulledFromB', uid, today: FIXTURE_TODAY,
    story: 'Habits made on another phone and pulled here: no packs, no areas, no onboarding record on this phone',
    habits: [habit('p1', TEMPLATE.walk20, {icon: 'run'}), habit('p2', TEMPLATE.breathe5, {icon: 'meditate'}), habit('p3', 'Budget', {icon: 'money'})],
    completions: ticks(['p1', 'p2'], -14, -1),
    storage: {},
  };
}

function preStage3(): Fixture {
  const uid = 'uid-old';
  return {
    name: 'preStage3', uid, today: FIXTURE_TODAY,
    story: 'Data from older builds: old-curve level keys, an onboarding record with answers, a 1a mirror without "dismissed"',
    habits: [habit('q1', TEMPLATE.walk20, {icon: 'run', createdDate: dayOffset(-90)})],
    completions: ticks(['q1'], -90, -1),
    storage: {
      [`celebrated:v1:${uid}`]: JSON.stringify(['level:4', 'level:5', 'streak:7', 'perfect:2026-01-01']),
      [`onboarding:v1:${uid}`]: onboarding(['walk20'], {answers: {timeBudget: 'min15', badHabit: 'alcohol'}}),
      'packs:mirror:v1': JSON.stringify({uid, record: null}),
    },
  };
}

function large(): Fixture {
  const uid = 'uid-large';
  const rng = createRng(4242);
  const habits: FixtureHabit[] = [];
  const completions: GamiCompletion[] = [];
  const days: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 300; i++) {
    const deleted = i % 2 === 1;
    const created = -rng.int(30, 1095);
    const weekdays = i % 5 === 0;
    habits.push(habit(`L${i}`, `Habit ${i}`, {
      icon: rng.pick(['run', 'book', 'meditate', 'work', 'heart', 'star']), createdDate: dayOffset(created), deleted,
      frequencyType: weekdays ? 'weekdays' : 'daily', days: weekdays ? (['mon', 'wed', 'fri'] as WeekdayKey[]) : [],
    }));
    for (let n = created; n <= 0; n++) {
      if (rng.bool(0.6)) completions.push({habitId: `L${i}`, date: dayOffset(n), completed: rng.bool(0.9)});
    }
  }
  for (let n = -1095; n <= 0; n++) {
    const date = dayOffset(n);
    days[date] = {};
    for (let k = 0; k < 3; k++) days[date][`L${k * 2}`] = {...answers, savedAt: (n + 2000) * 1000 + k, text: 'A few words'.repeat(3)};
  }
  return {
    name: 'large', uid, today: FIXTURE_TODAY, habits, completions,
    story: '300 habits (150 deleted), up to 3 years of completions, 3 reflections a day for 3 years',
    storage: {
      [`reflections:v1:${uid}`]: JSON.stringify({version: 1, days}),
      [`areas:v1:${uid}`]: JSON.stringify(Object.fromEntries(habits.map((h) => [h.habitId, 'Mind']))),
    },
  };
}

function renamedPackHabit(): Fixture {
  const uid = 'uid-renamed';
  return {
    name: 'renamedPackHabit', uid, today: FIXTURE_TODAY,
    story: 'Steady Energy holds a template habit the user renamed',
    habits: [habit('r1', 'Evening walk', {icon: 'run'}), habit('r2', TEMPLATE.stretch10, {icon: 'heart'})],
    completions: ticks(['r1', 'r2'], -7, -1),
    storage: {[`packs:v1:${uid}`]: packs(builtin('steady_energy', 'Steady Energy', ['r1', 'r2'], 0))},
  };
}

function customPackNoArea(): Fixture {
  const uid = 'uid-noarea';
  return {
    name: 'customPackNoArea', uid, today: FIXTURE_TODAY,
    story: 'A custom pack saved without its area (a rollback to an update before Stage 2 areas)',
    habits: [habit('n1', 'Guitar', {icon: 'music'}), habit('n2', 'Budget', {icon: 'money'})],
    completions: ticks(['n1', 'n2'], -10, -1),
    storage: {
      [`packs:v1:${uid}`]: packs({id: 'custom-1', kind: 'custom', name: 'Evenings', habitIds: ['n1', 'n2'], dropped: [], createdAt: 1, order: 0}),
      [`areas:v1:${uid}`]: JSON.stringify({n1: 'Discipline'}),
    },
  };
}

function skippedThenRetake(): Fixture {
  const uid = 'uid-skipped';
  return {
    name: 'skippedThenRetake', uid, today: FIXTURE_TODAY,
    story: 'Skipped setup, typed two template names by hand, then retakes from Settings',
    habits: [habit('k1', 'walk for 20 minutes', {icon: 'run'}), habit('k2', '  Breathe  for 5 minutes', {icon: 'meditate'})],
    completions: ticks(['k1'], -5, -1),
    storage: {[`onboarding:v1:${uid}`]: JSON.stringify({version: 1, skipped: true, answers: null, completedAt: null, addedTemplateIds: []})},
  };
}

function everythingCorrupt(): Fixture {
  const uid = 'uid-corrupt';
  const garbage = '{"version": 1, "packs": [{"id": 7}';
  return {
    name: 'everythingCorrupt', uid, today: FIXTURE_TODAY,
    story: 'Every stored value is garbage',
    habits: [habit('x1', 'Read', {icon: 'book'})],
    completions: ticks(['x1'], -3, -1),
    storage: {
      [`packs:v1:${uid}`]: garbage, 'packs:mirror:v1': garbage, [`onboarding:v1:${uid}`]: '[]',
      [`reflections:v1:${uid}`]: '{"version": 2}', [`areas:v1:${uid}`]: '"Mind"', [`profile:outline:v1:${uid}`]: 'null',
      [`celebrated:v1:${uid}`]: '{', [`onboarding:pending:v1:${uid}`]: 'yes',
    },
  };
}

function halfOnboarded(): Fixture {
  const uid = 'uid-half';
  return {
    name: 'halfOnboarded', uid, today: FIXTURE_TODAY,
    story: 'Signed up, the app was killed after the first starter habit and before the onboarding record was saved',
    habits: [habit('f1', TEMPLATE.walk20, {icon: 'run', createdDate: FIXTURE_TODAY})],
    completions: [],
    storage: {[`onboarding:pending:v1:${uid}`]: '1'},
  };
}

export const FIXTURES: readonly (() => Fixture)[] = [
  dupCalmMind, overLimitL3, recreated, clockAhead, pulledFromB, preStage3, large, renamedPackHabit, customPackNoArea,
  skippedThenRetake, everythingCorrupt, halfOnboarded,
];

export function fixture(name: string): Fixture {
  const build = FIXTURES.find((f) => f.name === name);
  if (!build) throw new Error(`no fixture ${name}`);
  return build();
}
