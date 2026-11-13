// S-4 (docs/PACKS_REPORTS_SPEC.md, section 17): template-creating actions ("Add the rest", a Settings retake) wait for
// this uid's first pull on this phone (S4-1 to S4-5, the R-1 interplay and the other odd states), and step 0 of the
// same change: celebrations are held while the celebrated keys can't be read.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';
import {fixture} from './helpers/fixtures.ts';
import {createDevice, createFakeServer} from './helpers/fake-firestore.ts';
import type {TestDb} from './helpers/sqlite-adapter.ts';

const FP = await import('../utils/firstPull.ts');
const {addTheRest} = await import('../utils/packs/addRest.ts');
const {builtinPack} = await import('../utils/packs/builtin.ts');
const PR = await import('../utils/packs/record.ts');
const {TEMPLATE_NAMES} = await import('../utils/onboarding/copy.ts');
const {buildPlan} = await import('../utils/onboarding/plan.ts');
const {emptyAnswers, validateAnswers} = await import('../utils/onboarding/flow.ts');
const habitsCore = await import('../db/habitsCore.js');
const {createCursorStore, emptyCursorState} = await import('../sync/cursorStore.ts');
const {createSyncEngine} = await import('../sync/engineCore.ts');
const {createCelebratedStore} = await import('../services/celebratedStore.ts');
const C = await import('../utils/celebrations.ts');

const UID = 'uid-s4';
const T0 = 1_762_000_000_000;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const STEADY = builtinPack('steady_energy').templates;
const steadyRecord = () => PR.packsFromValue({version: 1, packs: [
  {id: 'steady_energy', kind: 'builtin', builtinId: 'steady_energy', name: 'Steady Energy', habitIds: [], dropped: [], createdAt: 1, order: 0},
]})!;

// habit ids are UUIDs (a pulled doc with another id is invalid and skipped)
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

async function seedHabit(db: TestDb, habitId: string, habitName: string, synced: 0 | 1 = 0) {
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, ?, 'run', 'daily', NULL, 'user', ?, ?, 0, ?)`,
    [habitId, UID, habitName, T0, T0, synced],
  );
}

// The check the app runs (sync/syncEngine.js firstPullFor), over one device's engine and stored state
const firstPullOf = (device: {engine: {getStatus(): {initialPullDone: boolean}}; cursors: {load(uid: string): Promise<{initialPullDone: boolean}>}}, uid = UID) =>
  () => FP.firstPullResult({statusDone: device.engine.getStatus().initialPullDone, loadStored: () => device.cursors.load(uid)});

// "Add the rest" through the same gate as Home (app/(tabs)/index.tsx addRestFor)
function addRestThroughGate(check: () => Promise<'done' | 'waiting' | 'unknown'>, db: TestDb, made: string[]) {
  return FP.whenRestored(check, async () => addTheRest({
    addHabit: async (input) => {
      made.push(input.habitName);
      return `new-${made.length}`;
    },
    savePacks: async () => {},
  }, {record: steadyRecord(), packId: 'steady_energy', habits: await habitsCore.getActiveHabitsWithDays(db, UID), level: 10, reminderTime: null}));
}

describe('S-4: the first-pull check', () => {
  test('done from the engine\'s status, or from the stored state; waiting; unknown when the stored state can\'t be read', async () => {
    let reads = 0;
    const stored = (value: boolean) => async () => {
      reads += 1;
      return {initialPullDone: value};
    };
    assert.equal(await FP.firstPullResult({statusDone: true, loadStored: stored(false)}), 'done');
    assert.equal(reads, 0, 'no read when the running engine already says so');
    assert.equal(await FP.firstPullResult({statusDone: false, loadStored: stored(true)}), 'done');
    assert.equal(await FP.firstPullResult({statusDone: false, loadStored: stored(false)}), 'waiting');
    assert.equal(await FP.firstPullResult({statusDone: false, loadStored: () => Promise.reject(new Error('Row too big'))}), 'unknown');
  });

  test('whenRestored runs the action only for \'done\'', async () => {
    let ran = 0;
    for (const result of ['waiting', 'unknown'] as const) {
      assert.deepEqual(await FP.whenRestored(async () => result, async () => ++ran), {restored: false, result});
    }
    assert.equal(ran, 0);
    assert.deepEqual(await FP.whenRestored(async () => 'done', async () => ++ran), {restored: true, value: 1});
  });

  test('the approved line, used by both paths; the app wires the check before anything is read or created', () => {
    assert.equal(FP.RESTORING_LINE, 'Your habits are still being restored. Stay online and try again in a moment.');
    const home = source('app/(tabs)/index.tsx');
    assert.match(home, /const run = await whenRestored\(\(\) => firstPullFor\(userId\), async \(\) => \{\s*const parsed = await packsStore\.read\(userId\);/);
    assert.match(home, /if \(!run\.restored\) \{\s*notice = RESTORING_LINE;\s*return;/);
    const settings = source('app/(tabs)/settings.tsx');
    assert.match(settings, /const result = await firstPullFor\(uid\);\s*if \(result !== 'done'\) \{\s*setPlanNotice\(RESTORING_LINE\);\s*return;\s*\}\s*setPlanNotice\(null\);\s*router\.push\(\{pathname: '\/onboarding', params: \{entry: 'settings'\}\}\);/);
    assert.match(settings, /onPress=\{openPlan\}/);
    const sync = source('sync/syncEngine.js');
    assert.match(sync, /statusDone: activeUid === uid && engine\.getStatus\(\)\.initialPullDone,\s*loadStored: \(\) => cursorStore\.load\(uid\),/);
    assert.match(sync, /cursors: cursorStore,/);
    assert.match(sync, /a guest must count as 'done'/);
  });
});

describe('S-4: odd states', () => {
  test('S4-1: "Add the rest" before the first pull adopts and creates nothing; after it, it creates', async () => {
    const server = createFakeServer(() => T0);
    const b = await createDevice(server, UID, {now: T0});
    const made: string[] = [];
    assert.deepEqual(await addRestThroughGate(firstPullOf(b), b.db, made), {restored: false, result: 'waiting'});
    assert.deepEqual(made, []);
    await b.engine.requestSync();// an empty account: the first pull finishes at once
    const run = await addRestThroughGate(firstPullOf(b), b.db, made);
    assert.ok(run.restored);
    assert.equal(made.length, STEADY.length);
  });

  test('S4-2: once the pull is done, the retake\'s plan is built with the pulled names and offers none of them', async () => {
    const answers = validateAnswers(emptyAnswers());
    assert.ok(answers.valid);
    const offered = buildPlan(answers.value, {kind: 'none'}, []).picks.map((p) => p.habitName);
    assert.ok(offered.length > 0);
    const server = createFakeServer(() => T0);
    const a = await createDevice(server, UID, {now: T0});
    for (const [i, name] of offered.entries()) await seedHabit(a.db, uuid(i), name);
    await a.engine.requestSync();
    const b = await createDevice(server, UID, {now: T0});
    assert.equal(await firstPullOf(b)(), 'waiting', 'the Settings row opens nothing yet');
    await b.engine.requestSync();
    assert.equal(await firstPullOf(b)(), 'done');
    const pulled = (await habitsCore.getActiveHabitsWithDays(b.db, UID)).map((h: {habitName: string}) => h.habitName);
    assert.equal(buildPlan(answers.value, {kind: 'none'}, pulled).picks.some((p) => offered.includes(p.habitName)), false);
    // fixture skippedThenRetake: hand-typed template names are still matched loosely
    const f = fixture('skippedThenRetake');
    const names = buildPlan(answers.value, {kind: 'none'}, f.habits.map((h) => h.habitName)).picks.map((p) => p.habitName);
    assert.equal(names.includes(TEMPLATE_NAMES.walk20), false);
  });

  test('S4-3: two phones: B offline creates nothing; B pulls; the next tap adopts by name; the server holds 4, not 8', async () => {
    const server = createFakeServer(() => T0);
    const a = await createDevice(server, UID, {now: T0});
    for (const [i, t] of STEADY.entries()) await seedHabit(a.db, uuid(i), TEMPLATE_NAMES[t]);
    await a.engine.requestSync();
    assert.equal(server.page(UID, 'habits', null, 100).length, 4);

    const b = await createDevice(server, UID, {now: T0});// new phone, offline: no cycle has run
    const made: string[] = [];
    assert.deepEqual(await addRestThroughGate(firstPullOf(b), b.db, made), {restored: false, result: 'waiting'});
    assert.deepEqual(made, []);

    await b.engine.requestSync();// online: pulls A's four habits
    const run = await addRestThroughGate(firstPullOf(b), b.db, made);
    assert.ok(run.restored && run.value.added === 0);
    assert.deepEqual(made, [], 'adopted by name, nothing created');
    assert.equal(run.restored && run.value.record.packs[0].habitIds.length, 4);
    await b.engine.requestSync();
    assert.equal(server.page(UID, 'habits', null, 100).length, 4);
  });

  test('S4-4: after the first pull, later offline use is not blocked, even before sync starts (status \'off\')', async () => {
    const server = createFakeServer(() => T0);
    const b = await createDevice(server, UID, {now: T0});
    await b.engine.requestSync();
    b.engine.stop();// next launch: sync not started, status reset
    assert.equal(b.engine.getStatus().initialPullDone, false);
    assert.equal(await firstPullOf(b)(), 'done', 'from the stored state');
  });

  test('S4-5: another uid on the same phone waits for its own first pull (twoUsersOnePhone)', async () => {
    const storage = new Map<string, string>();
    const cursors = createCursorStore({getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); }}, 1);
    await cursors.save('uid-a', {...emptyCursorState(1), initialPullDone: true});
    const check = (uid: string, statusDone: boolean) => FP.firstPullResult({statusDone, loadStored: () => cursors.load(uid)});
    assert.equal(await check('uid-a', false), 'done');
    // the engine still running for uid-a says done, but syncEngine.js only uses it for the same uid
    assert.equal(await check('uid-b', false), 'waiting');
    assert.equal(await check('uid-a', false), 'done', 'switching back is not blocked');
  });

  test('R-1 interplay: cursors that can\'t be read give \'unknown\': nothing runs, and no network call is made', async () => {
    const calls: string[] = [];
    const cursors = {load: async () => { throw new Error('Row too big to fit into CursorWindow'); }, save: async () => {}};
    const engine = createSyncEngine({
      getUid: () => UID,
      store: {
        getDirtyHabits: async () => [], getDirtyCompletions: async () => [], markHabitSynced: async () => true,
        markCompletionSynced: async () => true, applyRemoteHabits: async () => ({written: 0}), applyRemoteCompletions: async () => ({applied: 0}),
      },
      remote: {
        probe: async () => { calls.push('probe'); }, writeHabits: async () => {}, writeCompletions: async () => {},
        pullPage: async () => ({docs: []}),
      },
      cursors,
    });
    engine.start();
    await engine.requestSync();
    assert.deepEqual(calls, []);
    let ran = false;
    const run = await FP.whenRestored(
      () => FP.firstPullResult({statusDone: engine.getStatus().initialPullDone, loadStored: () => cursors.load()}),
      async () => { ran = true; },
    );
    assert.deepEqual([run.restored, ran], [false, false]);
    assert.equal(run.restored ? null : run.result, 'unknown');
  });

  test('others: a corrupt stored state waits; a parser-version bump and "Re-sync everything" keep it done', async () => {
    const storage = new Map<string, string>([[`sync:${UID}`, '{not json']]);
    const kv = {getItem: async (k: string) => storage.get(k) ?? null, setItem: async (k: string, v: string) => { storage.set(k, v); }};
    assert.equal(await FP.firstPullResult({statusDone: false, loadStored: () => createCursorStore(kv, 1).load(UID)}), 'waiting');
    await createCursorStore(kv, 1).save(UID, {...emptyCursorState(1), initialPullDone: true});
    assert.equal(await FP.firstPullResult({statusDone: false, loadStored: () => createCursorStore(kv, 2).load(UID)}), 'done', 'version 2 keeps it');
    const server = createFakeServer(() => T0);
    const b = await createDevice(server, UID, {now: T0});
    await b.engine.requestSync();
    await b.engine.forceFullPull();
    assert.equal(await firstPullOf(b)(), 'done');
  });

  test('fixture pulledFromB: the pulled template habits are adopted, not created again', async () => {
    const f = fixture('pulledFromB');
    const made: string[] = [];
    const result = await addTheRest({
      addHabit: async (input) => {
        made.push(input.habitName);
        return `new-${made.length}`;
      },
      savePacks: async () => {},
    }, {record: steadyRecord(), packId: 'steady_energy', habits: f.habits.map((h) => ({habitId: h.habitId, habitName: h.habitName})), level: 10, reminderTime: null});
    assert.ok(result.record.packs[0].habitIds.includes('p1'), 'walk20 adopted');
    assert.equal(made.includes(TEMPLATE_NAMES.walk20), false);
  });
});

describe('step 0: celebrations are held while the celebrated keys can\'t be read', () => {
  const KEY = 'celebrated:v1:uid-s4';
  const TODAY = '2026-11-13';
  // a re-crossed level 4 and 7-day streak (an un-tick then a re-tick in the same run)
  const diff = {
    levelUp: 4, levelsCrossed: [4], streakMilestone: 7, streakMilestonesCrossed: [7], perfectDay: false, currentStreak: 7,
  } as unknown as Parameters<typeof C.celebrationsFor>[0];

  test('unreadable: a level and a streak celebrated before show no overlay, no repeat, and nothing is written', async () => {
    const m = kvStorage({[KEY]: JSON.stringify(['level:v2:4', 'streak:7'])});
    const store = createCelebratedStore(m);
    m.failReads([KEY]);
    // what the old path did: the empty set made them new again
    assert.equal(C.celebrationsFor(diff, TODAY, await store.load(UID)).celebrations.length, 2);
    const known = await store.known(UID);
    assert.equal(known, null);
    const found = C.celebrationsOrHeld(diff, TODAY, known);
    assert.deepEqual(found, {celebrations: [], keys: [], repeats: [], held: true});
    await store.mark(UID, found.keys, TODAY);
    assert.deepEqual(m.writes(), []);
  });

  test('readable again: the same re-cross is a quiet repeat (known() reads again and merges)', async () => {
    const m = kvStorage({[KEY]: JSON.stringify(['level:v2:4', 'streak:7'])});
    const store = createCelebratedStore(m);
    m.failReads([KEY]);
    assert.equal(await store.known(UID), null);
    m.failReads([KEY], false);
    const found = C.celebrationsOrHeld(diff, TODAY, await store.known(UID));
    assert.deepEqual([found.celebrations, found.repeats, found.held], [[], ['repeatLevel', 'repeatMedal'], false]);
  });

  test('the reflection path keeps its toast without the level-up overlay; the tick path holds early praise too', () => {
    const levelOnly = C.celebrationsOrHeld(diff, TODAY, null).celebrations.filter((c) => c.kind === 'levelUp');
    assert.deepEqual(levelOnly, []);
    const hook = source('hooks/use-celebrations.ts');
    assert.equal(hook.match(/celebratedStore\.known\(userId\)/g)?.length, 2);
    assert.doesNotMatch(hook, /celebratedStore\.load\(/);
    assert.match(hook, /const readEarly = celebrated !== null && /);
    assert.match(hook, /const toast = rewarded && vars \? picker\.pick\('reflectionSaved', vars\) : SAVED_PLAIN;/);
  });
});
