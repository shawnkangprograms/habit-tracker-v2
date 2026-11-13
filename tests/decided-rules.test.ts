// Rules decided after the Part B spec red-team (docs/TEST_STRATEGY.md), tested against today's code. A rule whose fix
// has not landed yet is a todo test (Phase 1b removes the todo with the fix); a rule that pins today's behaviour is a
// normal test. S-1 lives in tests/clock-skew.test.ts. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {FIXTURE_TODAY, dayOffset} from './helpers/fixtures.ts';
import {kvStorage} from './helpers/kv-storage.ts';
import type {GamiCompletion, GamiHabit} from '../utils/gamification.ts';

const G = await import('../utils/gamification.ts');
const {dailyCompletion} = await import('../utils/dailyCompletion.ts');
const {computeVitality} = await import('../utils/vitality.ts');
const {computeRadar} = await import('../utils/radar/score.ts');
const {computeSummary} = await import('../utils/summary.ts');
const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');
const PR = await import('../utils/packs/record.ts');
const PM = await import('../utils/packs/manage.ts');
const PMem = await import('../utils/packs/membership.ts');
const PCh = await import('../utils/packs/choose.ts');
const {createPacksStore} = await import('../services/packsStoreCore.ts');
const RR = await import('../utils/reflections/record.ts');
const RW = await import('../utils/reflections/rewards.ts');
const {createAreasStore, parseAreasRecord} = await import('../services/areasStoreCore.ts');
const NP = await import('../utils/notificationPrefs.ts');
const {createCelebratedStore} = await import('../services/celebratedStore.ts');
const OR = await import('../utils/onboarding/record.ts');
const SS = await import('../services/statsStore.ts');
const HL = await import('../utils/homeLoading.ts');
const LIM = await import('../utils/packs/limits.ts');

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('S-2: a habit created while the clock was ahead counts from today (createdDate clamped to today only)', () => {
  // Created with the clock 3 days ahead, then the clock was fixed; ticked today
  const habits: GamiHabit[] = [{habitId: 'a', createdDate: dayOffset(3), frequencyType: 'daily', days: [], deleted: false}];
  const completions: GamiCompletion[] = [{habitId: 'a', date: FIXTURE_TODAY, completed: true}];

  test('today: scheduled and done, so today is a perfect day and counts on the radar\'s and Vitality\'s inputs', () => {
    assert.deepEqual(dailyCompletion(habits, completions, FIXTURE_TODAY).today, {date: FIXTURE_TODAY, scheduled: 1, done: 1});
    const stats = G.computeGamification(habits, completions, FIXTURE_TODAY);
    assert.equal(stats.perfectDays, 1);
    assert.deepEqual([stats.currentStreak, stats.perHabitStreaks.a], [1, 1]);
    assert.equal(G.isScheduledOn({...habits[0], createdDate: FIXTURE_TODAY}, FIXTURE_TODAY), true);
    // Summary: today's entry and the habit's rate count it in both ranges
    const summary = computeSummary(habits.map((h) => ({...h, habitName: 'Read', icon: 'book'})), completions, FIXTURE_TODAY);
    for (const range of [summary.week, summary.month]) {
      const today = range.days[range.days.length - 1];
      assert.deepEqual([today.date, today.scheduled, today.done, today.perfect], [FIXTURE_TODAY, 1, 1, true]);
      assert.deepEqual([range.habits[0].done, range.habits[0].scheduled, range.empty], [1, 1, null]);
    }
  });

  test('a habit created today or before is untouched, and the clamp never moves a date earlier than today', () => {
    const past: GamiHabit = {habitId: 'p', createdDate: dayOffset(-4), frequencyType: 'daily', days: [], deleted: false};
    const clamped = G.clampCreatedDates([past, habits[0], {...past, habitId: 't', createdDate: FIXTURE_TODAY}], FIXTURE_TODAY);
    assert.equal(clamped[0], past);// same object
    assert.deepEqual(clamped.map((h) => h.createdDate), [dayOffset(-4), FIXTURE_TODAY, FIXTURE_TODAY]);
    assert.equal(habits[0].createdDate, dayOffset(3), 'the input is not mutated');
    // a malformed createdDate is left for the callers' own checks
    assert.equal(G.clampCreatedDates([{...past, createdDate: 'soon'}], FIXTURE_TODAY)[0].createdDate, 'soon');
  });

  test('every reader of createdDate in the app\'s pure code clamps it first (a new reader must be added here)', () => {
    // the only modules that read createdDate; each function that receives today clamps on entry
    const readers = (path: string) => source(path).split('\n').filter((l) => /\bcreatedDate\b/.test(l.replace(/\/\/.*$/, ''))).length;
    const gami = source('utils/gamification.ts');
    for (const fn of ['computeStreaks', 'countPerfectDays']) {
      const body = gami.slice(gami.indexOf(`export function ${fn}(`));
      assert.match(body.slice(0, 400), /requireToday\(today\);\s*habits = clampCreatedDates\(habits, today\);/, fn);
    }
    assert.match(source('utils/dailyCompletion.ts'), /const active = clampCreatedDates\(habits, today\)\.filter/);
    assert.match(source('utils/summary.ts'), /const active = clampCreatedDates\(habits, today\)\.filter/);
    // every app file mentioning createdDate outside comments: the producer (db/gamificationCore.js) and the two
    // modules above. The radar and Summary reach it only through them; a new file here needs the clamp
    const root = new URL('../', import.meta.url);
    const found: string[] = [];
    for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'db', 'sync', 'validation', 'constants']) {
      for (const entry of readdirSync(new URL(`${dir}/`, root), {recursive: true}) as string[]) {
        const path = `${dir}/${entry.replaceAll('\\', '/')}`;
        if (/\.(ts|tsx|js)$/.test(path) && readers(path) > 0) found.push(path);
      }
    }
    assert.deepEqual(found.sort(), ['db/gamificationCore.js', 'utils/dailyCompletion.ts', 'utils/gamification.ts']);
    assert.match(source('utils/radar/score.ts'), /dailyCompletion\(habits, input\.completions, input\.today\)/);
  });

  test('only clamped to today: no past day is invented for it, so Vitality and the radar have no closed history yet', () => {
    assert.deepEqual(dailyCompletion(habits, completions, FIXTURE_TODAY).closed, []);
    assert.equal(computeVitality(dailyCompletion(habits, completions, FIXTURE_TODAY)).state, 'starting');
    const radar = computeRadar({habits: habits.map((h) => ({...h, icon: 'book'})), completions, today: FIXTURE_TODAY, packs: null, areas: {}});
    assert.equal(radar.week.starting, true);
  });
});

describe('F-1: a failed reflections read never lowers XP or level', () => {
  test('unreadable storage is reported as unknown, never handed to the stats load as "no reflections"', async () => {
    const unreadable = kvStorage({'reflections:v1:uid-big': '{"version":1,"days":{}}'});
    unreadable.failReads('all');
    const store = createReflectionsStore(unreadable);
    const result = await store.read('uid-big').then((record) => record, () => 'rejected' as const);
    assert.equal(result, 'rejected', `got ${JSON.stringify(result)}`);
  });

  test('the stats load rejects with it, and the shared entry keeps the last numbers (never published as lower)', async () => {
    const habits: GamiHabit[] = [{habitId: 'h', createdDate: dayOffset(-10), frequencyType: 'daily', days: [], deleted: false}];
    const completions = Array.from({length: 10}, (_, i) => ({habitId: 'h', date: dayOffset(-10 + i), completed: true}));
    const reflections = completions.map((c, i) => ({habitId: 'h', date: c.date, savedAt: i + 1}));
    const good = G.computeGamification(habits, completions, FIXTURE_TODAY, reflections);
    const stats = {...good, vitality: null, radar: null} as never;// only the level matters here
    SS.reset('uid-xp');
    const first = SS.beginLoad('uid-xp', FIXTURE_TODAY, async () => stats);
    SS.publish(await first.promise, first);
    SS.markStale();
    const failed = SS.beginLoad('uid-xp', FIXTURE_TODAY, () => Promise.reject(new Error('Row too big to fit into CursorWindow')));
    assert.equal(await failed.promise, null);
    assert.deepEqual(SS.publish(await failed.promise, failed), {accepted: false, previous: null, comparable: false});
    assert.equal(SS.getEntry()?.stats.level, good.level);
    SS.reset(null);
  });

  test('Home: a failed load keeps the numbers shown for this user, or keeps the placeholder when none were shown', () => {
    const shown = {userId: 'u1', date: FIXTURE_TODAY, level: 4};
    assert.equal(HL.statsAfterLoad(shown, null, 'u1'), shown);
    assert.equal(HL.statsAfterLoad(shown, null, 'u2'), null, 'another user\'s numbers are never kept');
    const next = {...shown, level: 5};
    assert.equal(HL.statsAfterLoad(shown, next, 'u1'), next);
    assert.equal(HL.statsSlot({statsSettled: true, hasStats: false}), 'placeholder');
    assert.equal(HL.statsSlot({statsSettled: true, hasStats: true}), 'card');
    // Home wires both
    const home = source('app/(tabs)/index.tsx');
    assert.match(home, /const shown = statsAfterLoad\(statsRef\.current, snapshot, userId\);/);
    assert.doesNotMatch(home, /setStats\(snapshot\)/);
  });

  test('limit checks at an unknown level: a lower bound may allow; a refusal never names a level', () => {
    const unknown = {level: 2, known: false, kind: 'habits' as const, count: 14};
    const refused = LIM.checkAddAtLevel(unknown);
    assert.deepEqual(refused, {ok: false, room: 0, message: "Couldn't check your level just now. Try again in a moment."});
    assert.doesNotMatch(refused.ok ? '' : refused.message, /level \d/);
    assert.deepEqual(LIM.checkAddAtLevel({...unknown, count: 10}), {ok: true, room: 4});
    assert.match((LIM.checkAddAtLevel({...unknown, known: true}) as {message: string}).message, /Reach level 3/);
    assert.equal(LIM.limitMessageAt('packs', {level: 2, known: false}, 9), "Couldn't check your level just now. Try again in a moment.");
    assert.equal(LIM.limitCheckTrace(unknown, refused, 1).namedLevel, null);
    // every path: the shared check, the pack picker and Home's "Add the rest"
    const service = source('services/packLimits.ts');
    assert.match(service, /if \(result\.entry\) return \{level: result\.entry\.stats\.level, known: true\};/);
    assert.match(service, /return \{level: await getTicksOnlyLevel\(uid\), known: false\};/);
    assert.match(source('app/packs/choose.tsx'), /limitMessageAt\('packs', at, /);
    assert.match(source('app/(tabs)/index.tsx'), /limitMessageAt\('habits', at, /);
    assert.doesNotMatch(source('app/(tabs)/index.tsx') + source('app/packs/choose.tsx'), /limitMessageFor\(/);
  });

  test('the ticks-only level is a lower bound: reflections only ever add XP', () => {
    const habits: GamiHabit[] = [{habitId: 'h', createdDate: dayOffset(-30), frequencyType: 'daily', days: [], deleted: false}];
    const completions = Array.from({length: 30}, (_, i) => ({habitId: 'h', date: dayOffset(-30 + i), completed: true}));
    const reflections = completions.map((c, i) => ({habitId: 'h', date: c.date, savedAt: i + 1}));
    assert.ok(G.computeGamification(habits, completions, FIXTURE_TODAY, []).level <= G.computeGamification(habits, completions, FIXTURE_TODAY, reflections).level);
    assert.match(source('services/gamificationStats.ts'), /computeGamification\(rows\.habits, rows\.completions, today, \[\]\)\.level/);
  });

  test('what is at stake today: the same account loses its reflection XP when the read fails', async () => {
    const habits: GamiHabit[] = [{habitId: 'h', createdDate: dayOffset(-10), frequencyType: 'daily', days: [], deleted: false}];
    const completions = Array.from({length: 10}, (_, i) => ({habitId: 'h', date: dayOffset(-10 + i), completed: true}));
    const reflections = completions.map((c, i) => ({habitId: 'h', date: c.date, savedAt: i + 1}));
    const readable = G.computeGamification(habits, completions, FIXTURE_TODAY, reflections);
    const failed = G.computeGamification(habits, completions, FIXTURE_TODAY, []);// what an empty record gives
    assert.equal(readable.reflectionXp - failed.reflectionXp, 10 * G.REFLECTION_XP);
    assert.ok(failed.level < readable.level);
  });
});

describe('V-1: the current schedule is applied to past days (accepted limitation, pinned so a change is deliberate)', () => {
  test('changing a daily habit to Mondays only rewrites its past perfect days, streak and Vitality; its tick XP stays', () => {
    const daily: GamiHabit = {habitId: 'h', createdDate: dayOffset(-14), frequencyType: 'daily', days: [], deleted: false};
    const mondays: GamiHabit = {...daily, frequencyType: 'weekdays', days: ['mon']};
    const completions = Array.from({length: 14}, (_, i) => ({habitId: 'h', date: dayOffset(-14 + i), completed: true}));
    const before = G.computeGamification([daily], completions, FIXTURE_TODAY);
    const after = G.computeGamification([mondays], completions, FIXTURE_TODAY);
    assert.deepEqual([before.perfectDays, after.perfectDays], [14, 2]);// FIXTURE_TODAY is a Monday: 2 Mondays in the last 14 days
    assert.equal(after.completionXp, before.completionXp);
    const v = (h: GamiHabit) => computeVitality(dailyCompletion([h], completions, FIXTURE_TODAY));
    assert.notDeepEqual(v(daily), v(mondays));
  });
});

describe('S-6: notification and celebration settings are device settings, shared by every account on the phone', () => {
  test('their keys carry no uid', () => {
    assert.match(source('services/notificationPrefs.ts'), /const KEY = 'prefs:notifications:v1';/);
    assert.match(source('services/celebrationPrefs.ts'), /const KEY = 'prefs:celebrations';/);
  });
});

describe('P-8: a newer field survives an older build re-saving the record (except where a privacy whitelist applies)', () => {
  // Each test: a record as a newer build might write it (fields this build doesn't know, at every level), parsed by
  // today's code, changed the way an older build would change it, and saved again through the real store core.
  const UID = 'uid-p8';
  const memory = kvStorage;
  const stored = (m: {data: Map<string, string>}, key: string) => JSON.parse(m.data.get(key)!);

  const NEWER_PACKS = JSON.stringify({
    version: 1, futureTop: {kept: true},
    packs: [
      {id: 'calm_mind', kind: 'builtin', builtinId: 'calm_mind', name: 'Calm Mind', habitIds: ['h1'], dropped: [], createdAt: 1, order: 0, futureField: 7},
      {id: 'c1', kind: 'custom', name: 'Evenings', habitIds: ['h2'], dropped: [], createdAt: 2, order: 1, area: 'Mind', colour: 'teal'},
    ],
  });
  const okPacks = (raw: string) => {
    const parsed = PR.parsePacks(raw);
    assert.ok(parsed.kind === 'ok');
    return parsed.record;
  };

  test('a packs record still parses when it has fields this build does not know', () => {
    assert.equal(PR.parsePacks(NEWER_PACKS).kind, 'ok');
  });

  test('packs: rename, move a member, add a member and delete a pack keep the fields this build does not know', () => {
    const habits = [{habitId: 'h1', habitName: 'Breathe'}, {habitId: 'h2', habitName: 'Read'}, {habitId: 'h3', habitName: 'Walk'}];
    let record = okPacks(NEWER_PACKS);
    record = PM.savePack(record, {packId: 'c1', newId: 'unused', name: 'Nights', area: null, habitIds: ['h2'], habits, now: 3})!;
    record = PM.moveHabit(record, habits[0], 'c1');
    record = PMem.addToPack(record, 'calm_mind', 'h3');
    const saved = JSON.parse(PR.serialisePacks(record));
    assert.deepEqual(saved.futureTop, {kept: true});
    const byId = Object.fromEntries(saved.packs.map((p: {id: string}) => [p.id, p]));
    assert.equal(byId.calm_mind.futureField, 7);
    assert.deepEqual(byId.calm_mind.habitIds, ['h3']);
    assert.deepEqual([byId.c1.colour, byId.c1.name, byId.c1.area, byId.c1.habitIds], ['teal', 'Nights', 'Mind', ['h2', 'h1']]);
    // deleting a pack takes its own fields with it; the record's stay
    const deleted = JSON.parse(PR.serialisePacks(PM.deletePack(record, 'c1')));
    assert.deepEqual([deleted.futureTop, deleted.packs.length, deleted.packs[0].futureField], [{kept: true}, 1, 7]);
    assert.doesNotMatch(JSON.stringify(deleted), /teal/);
  });

  test('packs store: the record and the mirror keep them, from a storage read and from the startup mirror', async () => {
    const m = memory({[PR.packsKey(UID)]: NEWER_PACKS});
    const store = createPacksStore(m);
    await store.update(UID, (parsed) => PM.moveHabit(PM.baseRecord(parsed), {habitId: 'h2', habitName: 'Read'}, null));
    const canonical = stored(m, PR.packsKey(UID));
    const mirror = stored(m, PR.PACKS_MIRROR_KEY);
    for (const record of [canonical, mirror.record]) {
      assert.deepEqual(record.futureTop, {kept: true});
      assert.deepEqual(record.packs.map((p: {futureField?: number; colour?: string}) => [p.futureField, p.colour]), [[7, undefined], [undefined, 'teal']]);
      assert.deepEqual(record.packs[1].habitIds, []);
    }
    // an app start: memory comes from the mirror alone, then a write
    const next = createPacksStore(memory());
    next.loadMirror(m.data.get(PR.PACKS_MIRROR_KEY)!);
    const fromMirror = await next.read(UID);
    assert.ok(fromMirror.kind === 'ok');
    const m2 = memory();
    const later = createPacksStore(m2);
    later.loadMirror(m.data.get(PR.PACKS_MIRROR_KEY)!);
    await later.write(UID, PM.deletePack(fromMirror.record, 'c1'));
    assert.deepEqual([stored(m2, PR.packsKey(UID)).futureTop, stored(m2, PR.packsKey(UID)).packs[0].futureField], [{kept: true}, 7]);
    assert.equal(stored(m2, PR.PACKS_MIRROR_KEY).record.packs[0].futureField, 7);
  });

  test('packs: a stored record with no packs keeps its fields when a run creates the packs', () => {
    const empty = PR.parsePacks(JSON.stringify({version: 1, packs: [], futureTop: 'x'}));
    const next = PCh.packsAfterRun(empty, {chosen: ['calm_mind', 'steady_energy'], create: true, joins: [], existing: [], now: 5});
    assert.ok(next);
    const saved = JSON.parse(PR.serialisePacks(next));
    assert.deepEqual([saved.futureTop, saved.packs.length], ['x', 2]);
    // a new pack starts with nothing carried
    assert.equal(next.packs.some((p) => p.unknownFields !== undefined), false);
  });

  const DAY = '2026-11-05';
  const ANSWERS = {feel: 'ok', amount: 'all', helped: 'routine', blocker: 'none'} as const;
  const NEWER_REFLECTIONS = JSON.stringify({
    version: 1, futureTop: 't',
    days: {
      [DAY]: {a: {...ANSWERS, savedAt: 1, mood: 'bright'}, b: {...ANSWERS, feel: 'meh', savedAt: 2}},
      '2026-11-06': {c: {...ANSWERS, text: 'words', savedAt: 3}},
      someday: [1, 2],
    },
  });

  // Since F-1 a save writes the year item (reflections:v2:<uid>:2026); v1 is read and never written, so what belongs
  // to no year (the record's own keys, non-date keys) stays in v1. More in tests/reflections-years.test.ts.
  const YEAR_2026 = RR.reflectionsYearKey(UID, '2026');

  test('reflections: a save keeps unknown fields and unreadable days and entries, exactly as stored', async () => {
    const m = memory({[RR.reflectionsKey(UID)]: NEWER_REFLECTIONS});
    const store = createReflectionsStore(m);
    assert.equal(await store.save(UID, {habitId: 'd', date: DAY, answers: ANSWERS, text: '', savedAt: 4}), 'saved');
    const saved = stored(m, YEAR_2026);
    const before = JSON.parse(NEWER_REFLECTIONS);
    assert.deepEqual(saved.days[DAY].a, before.days[DAY].a);
    assert.deepEqual(saved.days[DAY].b, before.days[DAY].b);
    assert.deepEqual(saved.days['2026-11-06'], before.days['2026-11-06']);
    assert.deepEqual(saved.days[DAY].d, {...ANSWERS, savedAt: 4});
    assert.equal(m.data.get(RR.reflectionsKey(UID)), NEWER_REFLECTIONS, 'futureTop and someday stay in v1, never written');
  });

  test('reflections: an unreadable entry counts as already reflected (no bar, never written over) and earns no XP', async () => {
    const m = memory({[RR.reflectionsKey(UID)]: NEWER_REFLECTIONS});
    const store = createReflectionsStore(m);
    await store.read(UID);// migrates into the year item
    const yearBefore = m.data.get(YEAR_2026);
    assert.equal(await store.save(UID, {habitId: 'b', date: DAY, answers: ANSWERS, text: '', savedAt: 9}), 'exists');
    assert.equal(m.data.get(YEAR_2026), yearBefore, 'nothing written');
    assert.equal(m.data.get(RR.reflectionsKey(UID)), NEWER_REFLECTIONS);
    const record = await store.read(UID);
    assert.equal(RR.hasReflection(record, 'b', DAY), true);
    assert.equal(RR.findReflection(record, 'b', DAY), null);
    assert.equal(RW.wouldReward(record, {habitId: 'b', date: DAY, ticked: new Set(['a', 'b'])}), false);
    assert.equal(RW.wouldReward(record, {habitId: 'e', date: DAY, ticked: new Set(['a', 'b', 'e'])}), true);
    assert.deepEqual(RR.toGamiReflections(record).map((r) => r.habitId).sort(), ['a', 'c']);
    assert.equal(RW.rewardsLeft(record, DAY, new Set(['a', 'b'])), 2, 'only the readable one counts toward the cap');
  });

  test('reflections: parse and serialise are idempotent on a record holding only some days (reused by F-1 per year)', () => {
    const once = RR.serialiseReflections(RR.recordOf(RR.parseReflections(NEWER_REFLECTIONS)));
    assert.equal(RR.serialiseReflections(RR.recordOf(RR.parseReflections(once))), once);
    assert.deepEqual(JSON.parse(once), JSON.parse(NEWER_REFLECTIONS));
  });

  test('areas: setting one habit keeps the entries this build cannot read; setting that habit replaces its entry', async () => {
    const m = memory({'areas:v1:uid-p8': JSON.stringify({h1: 'Mind', h2: {area: 'Mind', at: 5}, h3: 'Spirit'})});
    const store = createAreasStore(m);
    assert.deepEqual(await store.read(UID), {h1: 'Mind'});
    assert.equal(await store.write(UID, 'h4', 'Health'), true);
    assert.deepEqual(stored(m, 'areas:v1:uid-p8'), {h1: 'Mind', h2: {area: 'Mind', at: 5}, h3: 'Spirit', h4: 'Health'});
    assert.equal(await store.write(UID, 'h3', 'Career'), true);
    assert.deepEqual(stored(m, 'areas:v1:uid-p8').h3, 'Career');
    assert.deepEqual(await store.read(UID), {h1: 'Mind', h4: 'Health', h3: 'Career'});
  });

  test('notification settings: a change keeps keys this build does not know; they never reach the settings in effect', () => {
    const raw = JSON.stringify({nudgeOn: false, quietHours: {from: '22:00'}, nudgeTime: '21:30'});
    const read = NP.parseStoredNotificationRecord(raw);
    assert.deepEqual(read.stored, {nudgeOn: false});// a value this build can't read (a new nudge time) is dropped
    assert.equal('quietHours' in NP.withDefaults(read.stored), false);
    const saved = JSON.parse(NP.serialiseStoredNotificationPrefs({...read.stored, nudgeOn: true}, read.unknownFields));
    assert.deepEqual(saved, {quietHours: {from: '22:00'}, nudgeOn: true});
    // the service saves through the serialiser with what it read
    assert.match(source('services/notificationPrefs.ts'), /kept = record\.unknownFields;/);
    assert.match(source('services/notificationPrefs.ts'), /AsyncStorage\.setItem\(KEY, serialiseStoredNotificationPrefs\(stored, kept\)\)/);
  });

  test('pinned: celebrated keeps every key it does not know (only perfect:/early: keys older than 7 days go)', async () => {
    const m = memory({'celebrated:v1:uid-p8': JSON.stringify(['level:v2:3', 'medal:gold:x', 'perfect:2026-10-01', 'perfect:2026-11-12'])});
    await createCelebratedStore(m).mark(UID, ['streak:7'], '2026-11-13');
    assert.deepEqual(stored(m, 'celebrated:v1:uid-p8').sort(), ['level:v2:3', 'medal:gold:x', 'perfect:2026-11-12', 'streak:7']);
  });

  test('pinned: the celebrations switch is written only when the user flips it', () => {
    const src = source('services/celebrationPrefs.ts');
    assert.equal(src.match(/setItem\(/g)?.length, 1);
    assert.match(src, /export function setCelebrationsEnabled\(value: boolean\): void \{[^}]*AsyncStorage\.setItem\(KEY, value \? '1' : '0'\)/);
  });

  test('negative: a property added in memory is never written, only what came from parsing', () => {
    const record = okPacks(NEWER_PACKS);
    const tampered = {...record, secret: 'x', packs: [{...record.packs[0], scores: [1, 2]}, record.packs[1]]};
    assert.doesNotMatch(PR.serialisePacks(tampered as typeof record), /secret|scores/);
    const reflections = RR.recordOf(RR.parseReflections(NEWER_REFLECTIONS));
    const a = reflections.days[DAY].a;
    const withSecret = {...reflections, secret: 1, days: {...reflections.days, [DAY]: {...reflections.days[DAY], a: {...a, answers: 'q10'}}}};
    assert.doesNotMatch(RR.serialiseReflections(withSecret as typeof reflections), /secret|q10/);
    assert.doesNotMatch(NP.serialiseStoredNotificationPrefs({nudgeOn: true, extra: 1} as never), /extra/);
  });

  test('negative: a known field always wins over a carried key of the same name', () => {
    const record = okPacks(NEWER_PACKS);
    const forged = {...record, unknownFields: {version: 9, packs: []}, packs: [{...record.packs[0], unknownFields: {name: 'Evil', id: 'x'}}]};
    const saved = JSON.parse(PR.serialisePacks(forged));
    assert.deepEqual([saved.version, saved.packs.length, saved.packs[0].name, saved.packs[0].id], [1, 1, 'Calm Mind', 'calm_mind']);
    // and the parser never collects a known key, even one whose value it drops
    const dropped = okPacks(JSON.stringify({version: 1, packs: [{...JSON.parse(NEWER_PACKS).packs[1], area: 'Spirit'}]}));
    assert.equal(dropped.packs[0].area, undefined);
    assert.deepEqual(dropped.packs[0].unknownFields, {colour: 'teal'});
  });

  test('negative: a stored "__proto__" key stays a plain key and never sets a prototype', () => {
    const raw = '{"version":1,"packs":[],"__proto__":{"polluted":true}}';
    const record = okPacks(raw);
    assert.ok(record.unknownFields && Object.prototype.hasOwnProperty.call(record.unknownFields, '__proto__'));
    assert.equal(Object.getPrototypeOf(record.unknownFields), Object.prototype);
    assert.equal(({} as {polluted?: boolean}).polluted, undefined);
    assert.match(PR.serialisePacks(record), /"__proto__":\{"polluted":true\}/);
    const areas = parseAreasRecord('{"__proto__":"Mind","h1":"Mind"}');
    assert.deepEqual(Object.keys(areas.areas), ['h1']);
  });

  test('carried fields are created only by the parsers (a new file here must be a parser, or only read them)', () => {
    const mentions = (path: string) => source(path).split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .filter((l) => !/^\s*import\b/.test(l))// the helper module's path is not a use
      .filter((l) => /\b(unknownFields|unreadDays)\b/.test(l));
    const root = new URL('../', import.meta.url);
    const found: string[] = [];
    for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'db', 'sync', 'validation', 'constants']) {
      for (const entry of readdirSync(new URL(`${dir}/`, root), {recursive: true}) as string[]) {
        const path = `${dir}/${entry.replaceAll('\\', '/')}`;
        if (/\.(ts|tsx|js)$/.test(path) && mentions(path).length > 0) found.push(path);
      }
    }
    assert.deepEqual(found.sort(), [
      'services/areasStoreCore.ts', 'services/notificationPrefs.ts', 'utils/notificationPrefs.ts', 'utils/packs/record.ts',
      'utils/reflections/record.ts',
    ]);
    // the one non-parser file only reads them from a parse result
    assert.deepEqual(mentions('services/notificationPrefs.ts').map((l) => l.trim()), ['kept = record.unknownFields;']);
  });

  test('exception: the onboarding record keeps its privacy whitelist and never saves fields it does not know', () => {
    const record = {...OR.completedRecord(null, 1), q10: 'alcohol'} as unknown as Parameters<typeof OR.serialiseRecord>[0];
    assert.doesNotMatch(OR.serialiseRecord(record), /q10|alcohol/);
    const parsed = OR.parseRecord(JSON.stringify({...JSON.parse(OR.serialiseRecord(OR.completedRecord(null, 1))), q10: 'alcohol'}));
    assert.ok(parsed.kind === 'ok');
    assert.doesNotMatch(OR.serialiseRecord(parsed.record), /q10|alcohol/);
  });
});
