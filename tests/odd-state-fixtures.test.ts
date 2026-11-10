// Named fixture accounts in odd real-world states (tests/helpers/fixtures.ts; docs/TEST_STRATEGY.md, Part E), run
// through the real parsers and pure cores: every stored value parsed, the stats load (XP, level, Vitality, radar),
// Home's pack groups, a Settings retake's plan, "Add the rest" and the packs picker. Each must not throw and must keep
// the Part C invariants; each fixture also pins what it is there for. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createTestDatabase} from './helpers/sqlite-adapter.ts';
import {FIXTURES, fixture, type Fixture} from './helpers/fixtures.ts';
import type {CompleteAnswers} from '../utils/onboarding/types.ts';
import type {HabitInput} from '../validation/validators.ts';
import type {BuiltinPackId} from '../utils/packs/builtin.ts';

const G = await import('../utils/gamification.ts');
const {computeVitality, hasCompletionHistory} = await import('../utils/vitality.ts');
const {dailyCompletion} = await import('../utils/dailyCompletion.ts');
const {computeRadar} = await import('../utils/radar/score.ts');
const PR = await import('../utils/packs/record.ts');
const {homeGroups, showChooseCard} = await import('../utils/packs/home.ts');
const {normaliseHabitName, missingTemplates} = await import('../utils/packs/membership.ts');
const {packsAfterPick} = await import('../utils/packs/picker.ts');
const {addTheRest} = await import('../utils/packs/addRest.ts');
const {checkAdd, limitsForLevel} = await import('../utils/packs/limits.ts');
const {BUILTIN_PACK_IDS, builtinPack} = await import('../utils/packs/builtin.ts');
const {TEMPLATE_NAMES} = await import('../utils/onboarding/copy.ts');
const {parseRecord} = await import('../utils/onboarding/record.ts');
const {buildPlan} = await import('../utils/onboarding/plan.ts');
const gate = await import('../utils/onboarding/gate.ts');
const {parseReflections, recordOf, toGamiReflections} = await import('../utils/reflections/record.ts');
const {parseAreas} = await import('../services/areasStoreCore.ts');
const {parseOutline} = await import('../services/profileOutlineStoreCore.ts');
const {createCelebratedStore} = await import('../services/celebratedStore.ts');
const {createPacksStore} = await import('../services/packsStoreCore.ts');
const {levelKey} = await import('../utils/celebrations.ts');
const gamiCore = await import('../db/gamificationCore.js');

// A retake that leans on Calm Mind and Steady Energy, with a sleep struggle and a Q10 answer
const RETAKE: CompleteAnswers = {
  timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'struggling', focus: ['mental', 'health'], challenge: 'low_energy',
  derails: 'stress', sleep: 'struggle', days: 'predictable', values: ['peace_of_mind'], badHabit: 'alcohol', confidence: 9,
};

// Everything the app derives from one account, through the real modules
async function runThrough(f: Fixture) {
  const get = (key: string) => f.storage[key] ?? null;
  const packs = PR.parsePacks(get(`packs:v1:${f.uid}`));
  const record = packs.kind === 'ok' ? packs.record : null;
  const reflections = recordOf(parseReflections(get(`reflections:v1:${f.uid}`)));
  const areas = parseAreas(get(`areas:v1:${f.uid}`));
  const onboarding = parseRecord(get(`onboarding:v1:${f.uid}`));
  const celebrated = await createCelebratedStore({getItem: async (k) => get(k), setItem: async () => {}}).load(f.uid);
  const parsedOther = {
    mirror: PR.parseMirror(get('packs:mirror:v1')),
    outline: parseOutline(get(`profile:outline:v1:${f.uid}`)),
    pending: gate.parsePending(get(`onboarding:pending:v1:${f.uid}`)),
  };

  const stats = G.computeGamification(f.habits, f.completions, f.today, toGamiReflections(reflections));
  const vitality = computeVitality(dailyCompletion(f.habits, f.completions, f.today), hasCompletionHistory(f.completions, f.today));
  const radar = computeRadar({habits: f.habits, completions: f.completions, today: f.today, packs: record, areas});

  const active = f.habits.filter((h) => !h.deleted);
  const refs = active.map(({habitId, habitName}) => ({habitId, habitName}));
  const done = new Set(f.completions.filter((c) => c.date === f.today && c.completed).map((c) => c.habitId));
  const todayRows = active.filter((h) => G.isScheduledOn(h, f.today)).map((h) => ({habitId: h.habitId, completed: done.has(h.habitId) ? 1 : 0}));
  const groups = homeGroups(packs, todayRows, refs);
  const plan = buildPlan(RETAKE, onboarding, refs.map((h) => h.habitName));
  const picked = packsAfterPick(packs, [...BUILTIN_PACK_IDS], refs, 1);

  const rests = new Map<string, {added: string[]; limited: boolean; failed: boolean}>();
  for (const pack of record ? record.packs.filter((p) => p.builtinId) : []) {
    if (!record) break;// narrows the type for the call below
    const added: string[] = [];
    let n = 0;
    const result = await addTheRest({
      addHabit: async (input: HabitInput) => {
        added.push(input.habitName);
        n += 1;
        return `${pack.id}-new${n}`;
      },
      savePacks: async () => {},
    }, {record, packId: pack.id, habits: refs, level: stats.level, reminderTime: '20:00'});
    rests.set(pack.id, {added, limited: result.limited, failed: result.failed});
  }
  return {packs, record, reflections, areas, onboarding, celebrated, parsedOther, stats, vitality, radar, active, refs, groups, plan, picked, rests};
}

// The invariants every fixture must keep, whatever its state
function checkInvariants(f: Fixture, r: Awaited<ReturnType<typeof runThrough>>) {
  // P1: after parsing, a habit is in at most one pack (the picker's result too)
  for (const rec of [r.record, r.picked]) {
    if (!rec) continue;
    const ids = rec.packs.flatMap((p) => p.habitIds);
    assert.equal(new Set(ids).size, ids.length, 'a habit is in two packs');
  }
  // O1: a retake never offers a template or replace habit the user already has by name
  const have = new Set(r.refs.map((h) => normaliseHabitName(h.habitName)));
  for (const pick of r.plan.picks) assert.ok(!have.has(normaliseHabitName(pick.habitName)), `retake offers "${pick.habitName}" again`);
  if (r.onboarding.kind === 'ok') {
    for (const pick of r.plan.picks) assert.ok(!(r.onboarding.record.addedTemplateIds as string[]).includes(pick.id), `retake offers ${pick.id} again`);
  }
  // "Add the rest" never creates a template name a member of that pack already has, and never more than the room
  for (const [packId, rest] of r.rests) {
    const pack = r.record!.packs.find((p) => p.id === packId)!;
    const members = new Set(pack.habitIds.flatMap((id) => r.refs.filter((h) => h.habitId === id).map((h) => normaliseHabitName(h.habitName))));
    for (const name of rest.added) assert.ok(!members.has(normaliseHabitName(name)), `Add the rest re-created "${name}" in ${packId}`);
    assert.ok(rest.added.length <= Math.max(0, limitsForLevel(r.stats.level).habits - r.refs.length), `${packId}: more than the room`);
    const templates = builtinPack(pack.builtinId as BuiltinPackId).templates;
    for (const name of rest.added) assert.ok(templates.some((t) => TEMPLATE_NAMES[t] === name), `${name} is not a ${packId} template`);
  }
  // Stats in bounds
  assert.ok(r.stats.level >= 1 && r.stats.totalXp >= 0);
  if (r.vitality.state === 'ready') assert.ok(r.vitality.value >= 0 && r.vitality.value <= 100);
  for (const a of [...r.radar.week.axes, ...r.radar.month.axes]) if (a.state === 'score') assert.ok(a.share >= 0 && a.share <= 1);
  // Home: every habit due today shows exactly once, in its pack or under Habits
  const shown = [...r.groups.packs.flatMap((p) => p.rows), ...r.groups.unpacked].map((row) => row.habitId);
  assert.equal(new Set(shown).size, shown.length, 'a habit shows twice on Home');
  void f;
}

describe('every fixture runs through every core without throwing and keeps the invariants', () => {
  for (const build of FIXTURES) {
    const f = build();
    test(`${f.name}: ${f.story}`, async () => {
      checkInvariants(f, await runThrough(f));
    });
  }
});

describe('what each fixture is there for', () => {
  test('dupCalmMind: the duplicates are kept as they are (no merge, no delete); nothing adds a third copy', async () => {
    const r = await runThrough(fixture('dupCalmMind'));
    const calm = r.groups.packs.find((p) => p.packId === 'calm_mind')!;
    assert.equal(calm.rows.length, 6);
    assert.deepEqual(calm.missing, []);
    assert.deepEqual(r.rests.get('calm_mind')!.added, []);
    for (const id of ['breathe5', 'journal3', 'lights_out', 'screens_off']) assert.ok(!r.plan.picks.some((p) => p.id === id));
  });

  test('overLimitL3: level 3 with 23 habits keeps everything; adding is refused naming level 7 (habits) and 5 (packs)', async () => {
    const r = await runThrough(fixture('overLimitL3'));
    assert.equal(r.stats.level, 3);
    assert.equal(r.active.length, 23);
    const habits = checkAdd({level: 3, kind: 'habits', count: 23});
    assert.ok(!habits.ok && /level 7 /.test(habits.message));
    const packs = checkAdd({level: 3, kind: 'packs', count: 3});
    assert.ok(!packs.ok && /level 5 /.test(packs.message));
    for (const rest of r.rests.values()) assert.deepEqual([rest.added.length, rest.limited], [0, true]);
  });

  test('recreated: the old history keeps its XP and streak; Vitality is starting again, with the "Restarts" copy (V-2)', async () => {
    const r = await runThrough(fixture('recreated'));
    assert.ok(r.stats.completionXp > 0 && r.stats.longestStreak >= 100);
    assert.deepEqual(r.vitality, {state: 'starting', restarts: true});
    assert.equal(r.radar.week.starting, true);
  });

  test('clockAhead: the tick dated tomorrow earns nothing yet; nothing throws', async () => {
    const r = await runThrough(fixture('clockAhead'));
    assert.equal(r.stats.completionXp, 12 * G.XP_PER_COMPLETION);// 11 days of a1 and a2's tick today; not tomorrow's
  });

  test('pulledFromB: no packs here, so the choose card shows; the radar falls back to icons; the retake skips them by name', async () => {
    const f = fixture('pulledFromB');
    const r = await runThrough(f);
    assert.equal(showChooseCard({parsed: r.packs, dismissed: false}, r.active.length), true);
    const axis = (name: string) => r.radar.week.axes.find((a) => a.axis === name)!;
    assert.deepEqual([axis('Health').state, axis('Mind').state, axis('Learning').state], ['score', 'score', 'empty']);
    assert.deepEqual(axis('Career'), {axis: 'Career', state: 'score', done: 0, scheduled: 7, share: 0, percent: 0});// "Budget", never ticked
    assert.ok(!r.plan.picks.some((p) => p.id === 'walk20' || p.id === 'breathe5'));
  });

  test('preStage3: old records read without loss; old-curve level keys never count as new ones', async () => {
    const r = await runThrough(fixture('preStage3'));
    assert.equal(r.onboarding.kind, 'ok');
    if (r.onboarding.kind === 'ok') assert.deepEqual([r.onboarding.record.answers, r.onboarding.record.addedTemplateIds], [null, ['walk20']]);
    assert.ok(r.celebrated.has('level:4') && !r.celebrated.has(levelKey(4)));
    assert.deepEqual(r.parsedOther.mirror, {uid: 'uid-old', parsed: {kind: 'none'}, dismissed: false});
  });

  test('large: 300 habits and 3 years compute in one stats load; the reflections record stays under 2 MB', async (t) => {
    const f = fixture('large');
    const started = performance.now();
    const r = await runThrough(f);
    const ms = performance.now() - started;
    const bytes = Buffer.byteLength(f.storage['reflections:v1:uid-large']);
    t.diagnostic(`large: ${f.completions.length} completion rows, ${Math.round(ms)} ms on this machine, reflections ${Math.round(bytes / 1024)} KB`);
    assert.ok(ms < 20_000, `${ms} ms`);
    assert.ok(bytes < 2 * 1024 * 1024);
    assert.ok(r.stats.reflectionXp <= 3 * 1096 * G.REFLECTION_XP);
  });

  test('customPackNoArea: the pack reads with no area; its habits use the stored area, then the icon', async () => {
    const r = await runThrough(fixture('customPackNoArea'));
    assert.equal(r.record!.packs[0].area, undefined);
    const state = (axis: string) => r.radar.week.axes.find((a) => a.axis === axis)!.state;
    assert.deepEqual([state('Discipline'), state('Career'), state('Mind')], ['score', 'score', 'empty']);
  });

  test('skippedThenRetake: hand-typed template names with odd case and spaces are not offered again', async () => {
    const r = await runThrough(fixture('skippedThenRetake'));
    assert.ok(!r.plan.picks.some((p) => p.id === 'walk20' || p.id === 'breathe5'));
  });

  test('everythingCorrupt: every value reads as none or corrupt, and the stats still compute', async () => {
    const r = await runThrough(fixture('everythingCorrupt'));
    assert.deepEqual([r.packs.kind, r.onboarding.kind, r.parsedOther.mirror, r.parsedOther.outline, r.parsedOther.pending],
      ['corrupt', 'corrupt', null, null, false]);
    assert.deepEqual([r.reflections.days, r.areas, r.celebrated.size], [{}, {}, 0]);
    assert.ok(r.stats.completionXp > 0);
  });

  test('halfOnboarded: killed after the first habit, the gate does not reopen onboarding; a retake offers the rest', async () => {
    const f = fixture('halfOnboarded');
    const r = await runThrough(f);
    assert.equal(gate.shouldCheckOnboarding({loaded: true, activeCount: 1, firstPullDone: true}), false);
    assert.ok(r.plan.picks.length > 0 && !r.plan.picks.some((p) => p.id === 'walk20'));
  });

  test('renamedPackHabit: runs through (the P-2 rule and its test arrive in 1b)', async () => {
    const r = await runThrough(fixture('renamedPackHabit'));
    assert.deepEqual(missingTemplates(r.record!, 'steady_energy', r.refs), ['walk20', 'water_meals', 'eat_produce']);
  });
});

describe('twoUsersOnePhone', () => {
  const A = 'uid-a';
  const B = 'uid-b';
  const HA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const HB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  test('one SQLite file holds both: each user reads only their own rows', async () => {
    const db = await createTestDatabase();
    for (const [habitId, userId] of [[HA, A], [HB, B]]) {
      await db.runAsync(
        `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
        VALUES (?, ?, 'Read', 'book', 'daily', NULL, 'user', 1000, 1000, 0, 1)`, [habitId, userId]);
      await db.runAsync('INSERT INTO completions (habitId, date, completed, updatedAt, synced) VALUES (?, ?, 1, 5, 1)', [habitId, '2026-11-08']);
    }
    const rowsA = await gamiCore.getUserRows(db, A);
    const rowsB = await gamiCore.getUserRows(db, B);
    assert.deepEqual([rowsA.habits.map((h: {habitId: string}) => h.habitId), rowsB.habits.map((h: {habitId: string}) => h.habitId)], [[HA], [HB]]);
    assert.deepEqual([rowsA.completions.length, rowsB.completions.length], [1, 1]);
  });

  test('the startup mirror holds A\'s packs; B signing in never sees them and reads B\'s own record', async () => {
    const recordA = {version: 1, packs: [{id: 'calm_mind', kind: 'builtin', builtinId: 'calm_mind', name: 'Calm Mind', habitIds: [HA], dropped: [], createdAt: 1, order: 0}]};
    const storage = new Map<string, string>([
      ['packs:mirror:v1', JSON.stringify({uid: A, record: recordA, dismissed: true})],
      [`packs:v1:${B}`, JSON.stringify({version: 1, packs: []})],
    ]);
    const store = createPacksStore({getItem: async (k) => storage.get(k) ?? null, multiSet: async (pairs) => {
      for (const [k, v] of pairs) storage.set(k, v);
    }});
    store.loadMirror(storage.get('packs:mirror:v1')!);
    assert.equal(store.peek(B), undefined);
    assert.deepEqual(await store.read(B), {kind: 'ok', record: {version: 1, packs: []}});
    assert.equal(JSON.parse(storage.get('packs:mirror:v1')!).uid, B);// rebuilt for B, never mixing A's data
  });
});
