// R-1 (docs/PACKS_REPORTS_SPEC.md, section 17): area entries of deleted habits are pruned at the next area write
// (R1-1 to R1-5), and storage that couldn't be read is never written over, store by store: areas, packs (a typed
// result every caller handles), the onboarding record, celebrated, the insight cache, the sync cursors (the cycle
// ends before any network call; Settings' line from 3 cycles) and the startup trace. A storage call that throws is
// "couldn't be read"; a corrupt value (readable, wrong shape) is still replaced, as before.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';
import {fixture} from './helpers/fixtures.ts';
import {createTestDatabase, type TestDb} from './helpers/sqlite-adapter.ts';

const {createAreasStore, pruneAreas} = await import('../services/areasStoreCore.ts');
const habitsCore = await import('../db/habitsCore.js');
const {createPacksStore, onPacksUpdate} = await import('../services/packsStoreCore.ts');
const PR = await import('../utils/packs/record.ts');
const PM = await import('../utils/packs/manage.ts');
const {packsAfterPick} = await import('../utils/packs/picker.ts');
const {createOnboardingStore} = await import('../services/onboardingStoreCore.ts');
const OR = await import('../utils/onboarding/record.ts');
const {buildPlan, createPlannedHabits} = await import('../utils/onboarding/plan.ts');
const {emptyAnswers, validateAnswers} = await import('../utils/onboarding/flow.ts');
const {createCelebratedStore} = await import('../services/celebratedStore.ts');
const {createInsightCache, cacheKey} = await import('../services/insightCache.ts');
const {createSyncEngine, nextCursorReadFailures} = await import('../sync/engineCore.ts');
const {emptyCursorState} = await import('../sync/cursorStore.ts');
const {cursorLine, CURSOR_LINE} = await import('../utils/syncStatusLine.ts');

const UID = 'u1';
const AREAS = 'areas:v1:u1';
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (m: {data: Map<string, string>}, key: string) => JSON.parse(m.data.get(key)!);

async function seedHabit(db: TestDb, habitId: string, deleted: boolean, userId = UID) {
  await db.runAsync(
    `INSERT INTO habits (habitId, userId, habitName, icon, frequencyType, reminderTime, source, createdAt, updatedAt, deleted, synced)
    VALUES (?, ?, 'Read', 'book', 'daily', NULL, 'user', 1000, 2000, ?, 1)`,
    [habitId, userId, deleted ? 1 : 0],
  );
}

describe('R-1: area entries of deleted habits are pruned at the next write', () => {
  const STORED = JSON.stringify({h1: 'Mind', h2: 'Health', h3: {area: 'Mind', at: 5}, h4: {x: 1}, hp: 'Career'});

  test('R1-1: a write removes the readable and the kept unreadable entries of deleted habits, and saves the area', async () => {
    const m = kvStorage({[AREAS]: STORED});
    const store = createAreasStore(m);
    assert.equal(await store.write(UID, 'h5', 'Learning', ['h2', 'h3']), true);
    assert.deepEqual(json(m, AREAS), {h4: {x: 1}, h1: 'Mind', hp: 'Career', h5: 'Learning'});
    assert.deepEqual(await store.read(UID), {h1: 'Mind', hp: 'Career', h5: 'Learning'});
  });

  test('R1-1: pruning alone is written even when the area itself is unchanged', async () => {
    const m = kvStorage({[AREAS]: STORED});
    assert.equal(await createAreasStore(m).write(UID, 'h1', 'Mind', ['h2']), true);
    assert.equal('h2' in json(m, AREAS), false);
  });

  test('R1-2: a read never writes', async () => {
    const m = kvStorage({[AREAS]: STORED});
    const store = createAreasStore(m);
    await store.read(UID);
    await store.read(UID);
    assert.deepEqual(m.writes(), []);
  });

  test('R1-3: an entry for a habit in a pack is kept (only habits known deleted are pruned)', async () => {
    const m = kvStorage({[AREAS]: STORED});
    await createAreasStore(m).write(UID, 'h5', 'Mind', []);// hp is in a pack, not deleted
    assert.equal(json(m, AREAS).hp, 'Career');
  });

  test('R1-4: storage that can\'t be read is never written over; nothing is pruned; a later write works', async () => {
    const m = kvStorage({[AREAS]: STORED});
    const store = createAreasStore(m);
    m.failReads([AREAS]);
    assert.equal(await store.write(UID, 'h5', 'Mind', ['h2']), false);
    assert.deepEqual(m.writes(), []);
    m.failReads([AREAS], false);
    assert.equal(await store.write(UID, 'h5', 'Mind', ['h2']), true);
    assert.deepEqual(Object.keys(json(m, AREAS)).sort(), ['h1', 'h3', 'h4', 'h5', 'hp']);
  });

  test('R1-5: deleted ids unknown (their read failed) prune nothing; another uid\'s map is never touched; writes queue', async () => {
    const m = kvStorage({[AREAS]: STORED, 'areas:v1:u2': JSON.stringify({h2: 'Health'})});
    const store = createAreasStore(m);
    assert.equal(await store.write(UID, 'h5', 'Mind', null), true);
    assert.equal(json(m, AREAS).h2, 'Health');
    await Promise.all([store.write(UID, 'a', 'Mind', ['h2']), store.write(UID, 'b', 'Health')]);
    assert.deepEqual([json(m, AREAS).a, json(m, AREAS).b, 'h2' in json(m, AREAS)], ['Mind', 'Health', false]);
    assert.equal(m.data.get('areas:v1:u2'), JSON.stringify({h2: 'Health'}));
  });

  test('R1-5: the deleted ids come from SQLite deleted = 1 only: a habit missing from this phone is never "deleted"', async () => {
    const db = await createTestDatabase();
    await seedHabit(db, 'live', false);
    await seedHabit(db, 'gone', true);
    await seedHabit(db, 'other-uid', true, 'u2');
    assert.deepEqual(await habitsCore.getDeletedHabitIds(db, UID), ['gone']);
    const m = kvStorage({[AREAS]: JSON.stringify({live: 'Mind', gone: 'Health', 'not-on-this-phone': 'Career'})});
    await createAreasStore(m).write(UID, 'live', 'Learning', await habitsCore.getDeletedHabitIds(db, UID));
    assert.deepEqual(json(m, AREAS), {live: 'Learning', 'not-on-this-phone': 'Career'});
    // the habit form: a failed read of the ids prunes nothing, and the area is still saved
    assert.match(source('app/habit-form.tsx'), /const deletedIds = await getDeletedHabitIds\(userId\)\.catch\(\(\) => null\);\s*await areasStore\.write\(userId, savedId, areaPick, deletedIds\);/);
  });

  test('fixture large: one write prunes the 150 deleted habits\' entries (size before and after)', async () => {
    const f = fixture('large');
    const db = await createTestDatabase();
    for (const h of f.habits) await seedHabit(db, h.habitId, h.deleted, f.uid);
    const deleted = await habitsCore.getDeletedHabitIds(db, f.uid);
    assert.equal(deleted.length, 150);
    const key = `areas:v1:${f.uid}`;
    const m = kvStorage(f.storage);
    const before = Buffer.byteLength(m.data.get(key)!);
    await createAreasStore(m).write(f.uid, 'L0', 'Health', deleted);
    const after = Buffer.byteLength(m.data.get(key)!);
    assert.equal(Object.keys(json(m, key)).length, 150);
    assert.ok(after < before * 0.6, `${before} -> ${after} bytes`);
  });

  test('fixture everythingCorrupt: a corrupt (readable) map is still replaced by a write', async () => {
    const f = fixture('everythingCorrupt');
    const m = kvStorage(f.storage);
    assert.equal(await createAreasStore(m).write(f.uid, 'x1', 'Mind'), true);
    assert.deepEqual(json(m, `areas:v1:${f.uid}`), {x1: 'Mind'});
  });

  test('pruneAreas returns the same record when nothing is deleted', () => {
    const record = {areas: {h1: 'Mind' as const}};
    assert.equal(pruneAreas(record, new Set(['zz'])), record);
  });
});

describe('R-1: the packs record that couldn\'t be read is never written over', () => {
  const TWO = PR.parsePacks(JSON.stringify({version: 1, packs: [
    {id: 'calm_mind', kind: 'builtin', builtinId: 'calm_mind', name: 'Calm Mind', habitIds: ['h1'], dropped: [], createdAt: 1, order: 0},
  ]}));
  const unreadablePacks = () => {
    const m = kvStorage({[PR.packsKey(UID)]: PR.serialisePacks(TWO.kind === 'ok' ? TWO.record : PR.EMPTY_PACKS)});
    m.failReads([PR.packsKey(UID)]);
    return m;
  };

  // the change each screen passes (app/packs/choose.tsx, app/packs/edit.tsx save and delete)
  const changes = {
    picker: (parsed: Parameters<typeof packsAfterPick>[0]) => packsAfterPick(parsed, ['steady_energy'], [], 5),
    edit: (parsed: Parameters<typeof PM.baseRecord>[0]) => PM.savePack(PM.baseRecord(parsed), {
      packId: null, newId: 'p1', name: 'Nights', area: 'Mind', habitIds: [], habits: [], now: 5,
    }),
    delete: (parsed: Parameters<typeof PM.baseRecord>[0]) => (parsed.kind === 'ok' ? PM.deletePack(parsed.record, 'calm_mind') : null),
  };

  for (const [name, change] of Object.entries(changes)) {
    test(`${name}: update resolves 'unreadable' and writes nothing; it works once storage can be read`, async () => {
      const m = unreadablePacks();
      const store = createPacksStore(m);
      assert.equal(await store.update(UID, change), 'unreadable');
      assert.deepEqual(m.writes(), []);
      m.failReads([PR.packsKey(UID)], false);
      assert.equal(await store.update(UID, change), 'saved');
    });
  }

  test('each screen shows its existing alert on \'unreadable\' and stays open', () => {
    const choose = source('app/packs/choose.tsx');
    const edit = source('app/packs/edit.tsx');
    assert.match(choose, /unreadable: \(\) => Alert\.alert\(SAVE_PACK_FAILED, TRY_AGAIN\)/);
    assert.match(edit, /unreadable: \(\) => Alert\.alert\(SAVE_PACK_FAILED, TRY_AGAIN\)/);
    assert.match(edit, /unreadable: \(\) => Alert\.alert\(DELETE_PACK_FAILED, TRY_AGAIN\)/);
    assert.equal(source('utils/packs/copy.ts').includes('export const SAVE_PACK_FAILED = "Couldn\'t save pack";'), true);
  });

  test('every packsStore.update call goes through onPacksUpdate (one handler per result, all required)', () => {
    for (const path of ['app/packs/choose.tsx', 'app/packs/edit.tsx', 'app/habit-form.tsx', 'app/onboarding.tsx', 'app/(tabs)/index.tsx']) {
      const src = source(path);
      const updates = src.match(/packsStore\.update\(/g)?.length ?? 0;
      assert.equal(src.match(/onPacksUpdate\(/g)?.length ?? 0, updates, path);
    }
    let called = '';
    onPacksUpdate('unreadable', {saved: () => { called = 's'; }, unchanged: () => { called = 'u'; }, unreadable: () => { called = 'x'; }});
    assert.equal(called, 'x');
  });
});

describe('R-1: the onboarding record that couldn\'t be read is never written over', () => {
  test('a Settings retake creates its habits and skips the record write silently; name dedupe still applies', async () => {
    const stored = OR.serialiseRecord({...OR.completedRecord(null, 1), addedTemplateIds: ['walk20']});
    const m = kvStorage({[OR.recordKey(UID)]: stored});
    const store = createOnboardingStore(m);
    m.failReads([OR.recordKey(UID)]);
    const parsed = await store.read(UID);
    assert.equal(parsed.kind, 'corrupt');
    const answers = validateAnswers(emptyAnswers());
    assert.ok(answers.valid);
    const plan = buildPlan(answers.value, parsed, []);
    const made: string[] = [];
    const result = await createPlannedHabits({
      addHabit: async (input: {habitName: string}) => {
        made.push(input.habitName);
        return `id-${made.length}`;
      },
      saveRecord: (record) => store.write(UID, record),
      now: () => 2,
    }, {plan, selected: new Set(plan.picks.map((p) => p.id)), reminderTime: null, session: {created: new Set(), saved: null}, room: 10});
    assert.ok(made.length > 0 && result.created.size === made.length, 'the habits are created');
    assert.equal(m.data.get(OR.recordKey(UID)), stored, 'the record is untouched');
    assert.deepEqual(m.writes(), []);
    // the next retake: the habits just made are excluded by name
    const next = buildPlan(answers.value, {kind: 'corrupt'}, made);
    assert.equal(next.picks.some((p) => made.includes(p.habitName)), false);
    // once a read of the record works, writes work again
    m.failReads([OR.recordKey(UID)], false);
    assert.equal((await store.read(UID)).kind, 'ok');
    await store.write(UID, OR.completedRecord(null, 3));
    assert.notEqual(m.data.get(OR.recordKey(UID)), stored);
  });
});

describe('R-1: celebrated and the insight cache', () => {
  test('celebrated: unreadable keys are never written over; marks stay in memory (no repeat), then merge in', async () => {
    const key = 'celebrated:v1:u1';
    const m = kvStorage({[key]: JSON.stringify(['level:v2:3', 'streak:3'])});
    const store = createCelebratedStore(m);
    m.failReads([key]);
    assert.deepEqual([...(await store.load(UID))], []);
    await store.mark(UID, ['level:v2:4'], '2026-11-13');
    assert.deepEqual(m.writes(), []);
    assert.ok((await store.load(UID)).has('level:v2:4'), 'not celebrated twice in this run');
    m.failReads([key], false);
    await store.mark(UID, ['streak:7'], '2026-11-13');
    assert.deepEqual(json(m, key).sort(), ['level:v2:3', 'level:v2:4', 'streak:3', 'streak:7']);
  });

  test('insight cache: an unreadable entry is never written over; the new one waits in memory, then is saved', async () => {
    const key = cacheKey(UID);
    const old = {v: 1, insight: {day: '2026-11-12', teaser: 'old', detail: 'old detail'}, attemptedDay: null, attemptStatus: null};
    const m = kvStorage({[key]: JSON.stringify(old)});
    const cache = createInsightCache(m);
    m.failReads([key]);
    const fresh = {v: 1 as const, insight: {day: '2026-11-13', teaser: 'new', detail: 'new detail'}, attemptedDay: null, attemptStatus: null};
    await cache.write(UID, fresh);
    assert.deepEqual(m.writes(), []);
    assert.deepEqual(await cache.read(UID), fresh);
    m.failReads([key], false);
    await cache.write(UID, fresh);
    assert.deepEqual(json(m, key), fresh);
  });
});

describe('R-1: sync cursors that can\'t be read', () => {
  function harness() {
    let failing = false;
    let saves = 0;
    const calls: string[] = [];
    let stored = emptyCursorState(1);
    const cursors = {
      load: async () => {
        if (failing) throw new Error('Row too big to fit into CursorWindow');
        return stored;
      },
      save: async (_uid: string, state: typeof stored) => {
        saves += 1;
        stored = state;
      },
    };
    const engine = createSyncEngine({
      getUid: () => UID,
      store: {
        getDirtyHabits: async () => [], getDirtyCompletions: async () => [],
        markHabitSynced: async () => true, markCompletionSynced: async () => true,
        applyRemoteHabits: async () => ({written: 0}), applyRemoteCompletions: async () => ({applied: 0}),
      },
      remote: {
        probe: async () => { calls.push('probe'); },
        writeHabits: async () => { calls.push('write'); },
        writeCompletions: async () => { calls.push('write'); },
        pullPage: async () => {
          calls.push('pull');
          return {docs: []};
        },
      },
      cursors,
      timeoutMs: 1000,
    });
    engine.start();
    return {engine, calls, fail: (on: boolean) => { failing = on; }, saves: () => saves};
  }

  test('a failed cursor read ends the cycle before any network call; nothing is saved; initialPullDone unchanged', async () => {
    const h = harness();
    await h.engine.requestSync();
    assert.equal(h.engine.getStatus().initialPullDone, true);
    const savesBefore = h.saves();
    h.calls.length = 0;
    h.fail(true);
    await h.engine.requestSync();
    assert.deepEqual(h.calls, [], 'no probe, no pull, no push');
    assert.equal(h.saves(), savesBefore, 'the cursors are never written (or reset)');
    const s = h.engine.getStatus();
    assert.deepEqual([s.initialPullDone, s.lastErrorKind, s.state, s.cursorReadFailures], [true, 'storage', 'idle', 1]);
  });

  test('3 cycles in a row show Settings\' line; the next good read clears it; sign-out and sign-in reset the count', async () => {
    const h = harness();
    h.fail(true);
    for (const expected of [1, 2]) {
      await h.engine.requestSync();
      assert.equal(h.engine.getStatus().cursorReadFailures, expected);
      assert.equal(cursorLine(h.engine.getStatus()), null);
    }
    await h.engine.requestSync();
    assert.equal(h.engine.getStatus().cursorReadFailures, 3);
    assert.equal(cursorLine(h.engine.getStatus()), CURSOR_LINE);
    assert.equal(h.saves(), 0);
    h.fail(false);
    await h.engine.requestSync();
    assert.equal(h.engine.getStatus().cursorReadFailures, 0);
    assert.equal(cursorLine(h.engine.getStatus()), null);
    h.fail(true);
    await h.engine.requestSync();
    h.engine.stop();
    assert.equal(h.engine.getStatus().cursorReadFailures, 0);
    h.engine.start();
    assert.equal(h.engine.getStatus().cursorReadFailures, 0);
  });

  test('the counter rule, and the log at the third cycle (every build; never an automatic reset)', () => {
    assert.equal(nextCursorReadFailures(2, {cursorRead: 'failed'}), 3);
    assert.equal(nextCursorReadFailures(5, {cursorRead: 'ok'}), 0);
    assert.equal(nextCursorReadFailures(2, {cursorRead: 'none'}), 2);
    const engine = source('sync/syncEngine.js');
    assert.match(engine, /s\.cursorReadFailures >= CURSOR_LINE_MIN_CYCLES && !loggedCursorFailures/);
    assert.doesNotMatch(engine + source('sync/engineCore.ts'), /cursors\.reset\(|resetCursors\(/);
  });
});

describe('R-1: the rest of the stores', () => {
  test('startup trace (dev): a save never writes over traces it couldn\'t read', () => {
    const src = source('services/startupTraceStore.ts');
    assert.match(src, /const kept = \[record, \.\.\.\(await readTraces\(\)\)\]/);
    assert.match(src, /async function readTraces\(\): Promise<TraceRecord\[\]> \{\s*const raw = await AsyncStorage\.getItem\(KEY\);/);
  });

  test('pinned: notification settings that couldn\'t be read are never saved over', () => {
    assert.match(source('services/notificationPrefs.ts'), /if \(!readOk && !\(await readStored\(\)\)\) \{[\s\S]*?return;/);
  });

  test('pinned: reflections that couldn\'t be read are never written (F-1)', () => {
    assert.match(source('services/reflectionsStoreCore.ts'), /return 'failed';\/\/ unreadable: never written over/);
  });
});
