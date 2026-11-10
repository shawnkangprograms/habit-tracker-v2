// Stage 2: creating, editing and deleting packs (utils/packs/manage.ts), the one limit check every add path uses
// (utils/packs/limits.ts, checkAdd), grandfathering accounts above a limit, and the store's single write
// (services/packsStoreCore.ts). docs/PACKS_REPORTS_SPEC.md, sections 2, 2b, 4 and 16.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {HabitInput} from '../validation/validators.ts';
import type {Pack, PacksRecord} from '../utils/packs/record.ts';

const m = await import('../utils/packs/manage.ts');
const lim = await import('../utils/packs/limits.ts');
const pc = await import('../utils/packs/copy.ts');
const r = await import('../utils/packs/record.ts');
const h = await import('../utils/packs/home.ts');
const plan = await import('../utils/onboarding/plan.ts');
const {createPacksStore} = await import('../services/packsStoreCore.ts');

const SPEC = readFileSync(new URL('../docs/PACKS_REPORTS_SPEC.md', import.meta.url), 'utf8');
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

const steady: Pack = {
  id: 'steady_energy', kind: 'builtin', builtinId: 'steady_energy', name: 'Steady Energy',
  habitIds: ['walk', 'stretch'], dropped: ['water_meals'], createdAt: 1, order: 0,
};
const mine: Pack = {id: 'c1', kind: 'custom', name: 'Evenings', habitIds: ['read'], dropped: [], createdAt: 2, order: 1, area: 'Mind'};
const RECORD: PacksRecord = {version: 1, packs: [steady, mine]};
const HABITS = [
  {habitId: 'walk', habitName: 'Walk for 20 minutes'},
  {habitId: 'stretch', habitName: 'Stretch for 10 minutes'},
  {habitId: 'water', habitName: 'drink  water with each MEAL'},
  {habitId: 'read', habitName: 'Read'},
  {habitId: 'gym', habitName: 'Gym'},
];
const habit = (id: string) => HABITS.find((x) => x.habitId === id)!;
const byId = (rec: PacksRecord, id: string) => rec.packs.find((p) => p.id === id)!;

describe('pack names', () => {
  test('trimmed, spaces collapsed, 1 to 24 characters, unique ignoring case; the approved messages', () => {
    assert.equal(m.packNameError('   ', RECORD), 'Give your pack a name.');
    assert.equal(m.packNameError('x'.repeat(25), RECORD), 'Use 24 characters or fewer.');
    assert.equal(m.packNameError(`  ${'x'.repeat(24)}  `, RECORD), null);
    assert.equal(m.packNameError(' evenings ', RECORD), 'You already have a pack with that name.');
    assert.equal(m.packNameError('steady   ENERGY', RECORD), 'You already have a pack with that name.');
    assert.equal(m.packNameError('Evenings', RECORD, 'c1'), null);// its own name, when editing it
    assert.equal(m.normalisePackName('  Morning \n\t routine '), 'Morning routine');// a pasted line break
    assert.equal(m.packNameError('a\u0000', RECORD), null);// control characters never reach the record
    assert.equal(m.normalisePackName('a\u0000b'), 'a b');
  });

  test('the record accepts exactly what the edit screen saves', () => {
    const name = m.normalisePackName('  Late   night\nwork ');
    assert.deepEqual(r.validatePackName(name), {valid: true, value: name});
    assert.deepEqual(r.validatePackName('a\nb'), {valid: false, reason: 'control'});
  });
});

describe('create and edit', () => {
  test('a new custom pack: after the others, with its area, the ticked habits moved in', () => {
    const next = m.savePack(RECORD, {packId: null, newId: 'n1', name: ' Mornings ', area: 'Health', habitIds: ['walk', 'gym'], habits: HABITS, now: 9})!;
    const created = byId(next, 'n1');
    assert.deepEqual(
      {...created},
      {id: 'n1', kind: 'custom', name: 'Mornings', habitIds: ['walk', 'gym'], dropped: [], createdAt: 9, order: 2, area: 'Health'},
    );
    assert.deepEqual(byId(next, 'steady_energy').habitIds, ['stretch']);// a habit is in at most one pack
    assert.deepEqual(byId(next, 'steady_energy').dropped, ['water_meals', 'walk20']);// so "Add the rest" won't copy it back
    assert.equal(r.parsePacks(r.serialisePacks(next)).kind, 'ok');
  });

  test('an empty pack is allowed; a new pack needs an area and a valid, unused name', () => {
    assert.deepEqual(m.savePack(RECORD, {packId: null, newId: 'n1', name: 'Empty', area: 'Career', habitIds: [], habits: HABITS, now: 9})!
      .packs.at(-1)!.habitIds, []);
    assert.equal(m.savePack(RECORD, {packId: null, newId: 'n1', name: 'Empty', area: null, habitIds: [], habits: HABITS, now: 9}), null);
    assert.equal(m.savePack(RECORD, {packId: null, newId: 'n1', name: 'EVENINGS', area: 'Mind', habitIds: [], habits: HABITS, now: 9}), null);
    assert.equal(m.savePack(RECORD, {packId: null, newId: 'n1', name: '', area: 'Mind', habitIds: [], habits: HABITS, now: 9}), null);
  });

  test('editing a built-in pack: rename, untick (dropped), tick back (out of dropped); its area never changes', () => {
    const edited = m.savePack(RECORD, {
      packId: 'steady_energy', newId: 'unused', name: 'My energy', area: 'Mind', habitIds: ['walk', 'water'], habits: HABITS, now: 9,
    })!;
    const pack = byId(edited, 'steady_energy');
    assert.equal(pack.name, 'My energy');
    assert.deepEqual(pack.habitIds, ['walk', 'water']);
    assert.deepEqual(pack.dropped, ['stretch10']);// water_meals came back (name matched ignoring case and spaces)
    assert.equal(m.packArea(pack), 'Health');
    assert.equal(pack.builtinId, 'steady_energy');
    assert.equal(r.parsePacks(r.serialisePacks(edited)).kind, 'ok');
  });

  test('ticking a habit that is in another pack moves it; a custom pack keeps its area', () => {
    const edited = m.savePack(RECORD, {packId: 'c1', newId: 'unused', name: 'Evenings', area: 'Career', habitIds: ['read', 'stretch'], habits: HABITS, now: 9})!;
    assert.deepEqual(byId(edited, 'c1').habitIds, ['read', 'stretch']);
    assert.equal(byId(edited, 'c1').area, 'Mind');
    assert.deepEqual(byId(edited, 'steady_energy').habitIds, ['walk']);
  });

  test('a custom pack without an area (from a rollback) is still read, and gets one when edited', () => {
    const lost = {version: 1, packs: [{...mine, area: undefined}]};
    const parsed = r.parsePacks(JSON.stringify(lost));
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.equal(m.packArea(parsed.record.packs[0]), null);
    const fixed = m.savePack(parsed.record, {packId: 'c1', newId: 'x', name: 'Evenings', area: 'Relations', habitIds: ['read'], habits: HABITS, now: 9})!;
    assert.equal(fixed.packs[0].area, 'Relations');
    assert.equal(r.parsePacks(JSON.stringify({version: 1, packs: [{...mine, area: 'Space'}]})).kind, 'ok');// unknown: no area
  });

  test('editing a pack that no longer exists saves nothing', () => {
    assert.equal(m.savePack(RECORD, {packId: 'gone', newId: 'x', name: 'Gone', area: null, habitIds: [], habits: HABITS, now: 9}), null);
  });
});

describe('moving habits (the habit form\'s "Habit pack" row) and deleting packs', () => {
  test('move between packs, out to None, and back in; unchanged when already there', () => {
    const out = m.moveHabit(RECORD, habit('walk'), null);
    assert.deepEqual(byId(out, 'steady_energy').habitIds, ['stretch']);
    assert.deepEqual(byId(out, 'steady_energy').dropped, ['water_meals', 'walk20']);
    const back = m.moveHabit(out, habit('walk'), 'steady_energy');
    assert.deepEqual(byId(back, 'steady_energy').dropped, ['water_meals']);
    assert.equal(m.moveHabit(RECORD, habit('walk'), 'steady_energy'), RECORD);
    assert.equal(m.moveHabit(RECORD, habit('gym'), 'nope'), RECORD);
    const moved = m.moveHabit(RECORD, habit('read'), 'steady_energy');
    assert.deepEqual(byId(moved, 'c1').habitIds, []);
    assert.deepEqual(byId(moved, 'steady_energy').dropped, ['water_meals']);// "Read" is no template: nothing dropped
  });

  test('deleting a pack keeps its habits: they become unpacked on Home', () => {
    const next = m.deletePack(RECORD, 'steady_energy');
    assert.deepEqual(next.packs.map((p) => p.id), ['c1']);
    const today = HABITS.map((x) => ({habitId: x.habitId, completed: 0}));
    const g = h.homeGroups({kind: 'ok', record: next}, today, HABITS);
    assert.deepEqual(g.unpacked.map((x) => x.habitId), ['walk', 'stretch', 'water', 'gym']);
    assert.equal(m.deletePack(RECORD, 'nope'), RECORD);
  });

  test('a pack with no active habits says "No habits yet"; one with habits not due today keeps "Nothing scheduled today"', () => {
    const rec: PacksRecord = {version: 1, packs: [{...mine, habitIds: ['deleted']}, {...steady, order: 2}]};
    const g = h.homeGroups({kind: 'ok', record: rec}, [], HABITS);
    assert.deepEqual(g.packs.map((p) => [p.packId, p.hasHabits]), [['c1', false], ['steady_energy', true]]);
    assert.equal(pc.packProgress(0, 0, false), 'No habits yet');
    assert.equal(pc.packProgress(0, 0, true), 'Nothing scheduled today');
    assert.equal(h.homeGroups({kind: 'ok', record: rec}, [], null).packs[0].hasHabits, true);// unknown: no claim
  });
});

describe('the store: one write for the record, the mirror and (deleting the last pack) "Not now"', () => {
  function storage() {
    const data = new Map<string, string>();
    const sets: [string, string][][] = [];
    return {data, sets, storage: {
      getItem: async (key: string) => data.get(key) ?? null,
      multiSet: async (pairs: [string, string][]) => {
        sets.push(pairs);
        for (const [k, v] of pairs) data.set(k, v);
      },
    }};
  }

  test('a custom pack round-trips through the record and the mirror with its area', async () => {
    const s = storage();
    const store = createPacksStore(s.storage);
    await store.write('u1', RECORD);
    assert.deepEqual(s.sets.map((pairs) => pairs.map(([k]) => k)), [[r.packsKey('u1'), r.PACKS_MIRROR_KEY]]);
    const mirror = r.parseMirror(s.data.get(r.PACKS_MIRROR_KEY)!)!;
    assert.deepEqual(mirror.parsed, r.parsePacks(s.data.get(r.packsKey('u1'))!));
    assert.equal(mirror.parsed.kind === 'ok' && mirror.parsed.record.packs.find((p) => p.id === 'c1')?.area, 'Mind');
  });

  test('deleting the last pack saves the record, "Not now" and the mirror in one multiSet; other deletes don\'t dismiss', async () => {
    const s = storage();
    const store = createPacksStore(s.storage);
    await store.write('u1', RECORD);
    const remove = (id: string) => store.update('u1', (p) => (p.kind === 'ok' ? m.deletePack(p.record, id) : null), {dismissIfEmpty: true});
    await remove('c1');
    assert.equal(s.data.has(r.chooseDismissedKey('u1')), false);
    assert.equal(store.peek('u1')!.dismissed, false);
    await remove('steady_energy');
    assert.deepEqual(s.sets.at(-1)!.map(([k]) => k), [r.packsKey('u1'), r.chooseDismissedKey('u1'), r.PACKS_MIRROR_KEY]);
    assert.equal(s.data.get(r.chooseDismissedKey('u1')), r.DISMISSED_VALUE);
    assert.equal(r.parseMirror(s.data.get(r.PACKS_MIRROR_KEY)!)!.dismissed, true);
    assert.equal(h.showChooseCard(store.peek('u1')!, 5), false);// the card doesn't come straight back
  });
});

describe('limits: one check, adding only', () => {
  test('the formula: habits 12 + 2(level - 1), packs 2 + floor((level - 1) / 2)', () => {
    const table = [1, 2, 3, 4, 5, 10].map((l) => [l, lim.limitsForLevel(l).habits, lim.limitsForLevel(l).packs]);
    assert.deepEqual(table, [[1, 12, 2], [2, 14, 2], [3, 16, 3], [4, 18, 3], [5, 20, 4], [10, 30, 6]]);
  });

  test('checkAdd: room left, or the approved message naming the next level with more', () => {
    assert.deepEqual(lim.checkAdd({level: 1, kind: 'habits', count: 11}), {ok: true, room: 1});
    assert.deepEqual(lim.checkAdd({level: 1, kind: 'habits', count: 12}),
      {ok: false, room: 0, message: 'Habit limit reached. Reach level 2 to add more habits.'});
    assert.deepEqual(lim.checkAdd({level: 2, kind: 'packs', count: 2}),
      {ok: false, room: 0, message: 'Pack limit reached. Reach level 3 to add more habit packs.'});
    assert.deepEqual(lim.checkAdd({level: 1, kind: 'habits', count: 10, adding: 3}),
      {ok: false, room: 2, message: 'Habit limit reached. Reach level 2 to add more habits.'});
  });

  test('grandfathering: 20 habits at level 1 cannot add, but moving, editing and deleting still work', () => {
    assert.equal(lim.checkAdd({level: 1, kind: 'habits', count: 20}).ok, false);
    assert.equal(lim.checkAdd({level: 1, kind: 'packs', count: 4}).ok, false);
    // packs over the limit are kept and can still be edited, moved between and deleted
    const four: PacksRecord = {version: 1, packs: [steady, mine, {...mine, id: 'c2', name: 'B', order: 2}, {...mine, id: 'c3', name: 'C', order: 3}]};
    assert.ok(m.savePack(four, {packId: 'c2', newId: 'x', name: 'Renamed', area: null, habitIds: ['gym'], habits: HABITS, now: 1}));
    assert.notEqual(m.moveHabit(four, habit('gym'), 'c3'), four);
    assert.equal(m.deletePack(four, 'c3').packs.length, 3);
    // the limit is only consulted where something is added: never on a tick, an edit or a delete
    const form = source('../app/habit-form.tsx');
    assert.match(form, /if \(habitId\) await updateHabit\(userId, habitId, input\.value\);\s*else \{\s*\/\/[^\n]*\n\s*const check = await checkAddFor\(userId, 'habits'\);/);
    assert.equal(form.match(/checkAddFor\(/g)!.length, 1);
    const home = source('../app/(tabs)/index.tsx');
    const toggle = home.slice(home.indexOf('const handleToggle'), home.indexOf('const handleToggle') + 3000);
    assert.doesNotMatch(toggle, /checkAdd|roomFor|limitsForLevel/);
  });

  test('every add path goes through checkAdd', () => {
    assert.match(source('../utils/packs/addRest.ts'), /checkAdd\(\{level: input\.level, kind: 'habits'/);
    assert.match(source('../utils/packs/picker.ts'), /checkAdd\(\{level: input\.level, kind: 'packs'/);
    assert.match(source('../app/(tabs)/index.tsx'), /checkAdd\(\{level, kind: 'habits'[\s\S]*checkAdd\(\{level, kind: 'packs'/);
    assert.match(source('../app/packs/edit.tsx'), /checkAddFor\(uid, 'packs'\)/);
    assert.match(source('../app/packs/choose.tsx'), /checkAdd\(\{level, kind: 'packs', count: packCount \+ picked\.length\}\)/);
    assert.match(source('../app/onboarding.tsx'), /if \(entry === 'settings'\) \{[\s\S]*checkAddFor\(userId, 'habits', remaining\)/);
  });

  test('the level comes from the gamification stats only (no copy of the XP curve)', () => {
    const service = source('../services/packLimits.ts');
    assert.match(service, /loadShared\(uid, getLocalDateString\(\), \(\) => getGamificationStats\(uid\)/);
    assert.doesNotMatch(service, /levelFromXp|xpToReachLevel|totalXp|\b50\b|\b100\b/);
  });
});

describe('the level named in a limit message counts what the account already has', () => {
  // {x}: the lowest level whose limit is higher than both the current limit and the current count
  const habitsAt = (level: number, count: number, adding?: number) => lim.checkAdd({level, kind: 'habits', count, adding});
  const packsAt = (level: number, count: number) => lim.checkAdd({level, kind: 'packs', count});
  const msgLevel = (check: {ok: boolean; message?: string}) => {
    assert.equal(check.ok, false);
    return Number(/level (\d+)/.exec(check.message!)![1]);
  };

  test('23 habits at level 3 names level 7 (12 + 2 x 6 = 24 > 23), never level 4', () => {
    assert.equal(lim.nextLimitLevel(3, 'habits', 23), 7);
    assert.deepEqual(habitsAt(3, 23), {ok: false, room: 0, message: 'Habit limit reached. Reach level 7 to add more habits.'});
    assert.equal(lim.limitMessageFor('habits', 3, 23), 'Habit limit reached. Reach level 7 to add more habits.');
  });

  test('habits over the limit: 18 at level 3 names 5 (level 4 allows only 18), 17 names 4', () => {
    assert.equal(msgLevel(habitsAt(3, 18)), 5);
    assert.equal(msgLevel(habitsAt(3, 17)), 4);
  });

  test('exactly at the limit: unchanged, the next level with more', () => {
    assert.equal(msgLevel(habitsAt(3, 16)), 4);
    assert.equal(msgLevel(habitsAt(1, 12)), 2);
    assert.equal(msgLevel(packsAt(2, 2)), 3);
  });

  test('partly full, adding several: unchanged (level 1, 10 habits, adding 3 names 2)', () => {
    assert.deepEqual(habitsAt(1, 10, 3), {ok: false, room: 2, message: 'Habit limit reached. Reach level 2 to add more habits.'});
  });

  test('packs over the limit: 6 at level 3 names 11, 4 at level 1 names 7', () => {
    assert.equal(msgLevel(packsAt(3, 6)), 11);
    assert.equal(msgLevel(packsAt(1, 4)), 7);
    assert.equal(lim.limitMessageFor('packs', 3, 6), 'Pack limit reached. Reach level 11 to add more habit packs.');
  });

  test('property: levels 1-40 x counts 0-60, the named level is the lowest with room', () => {
    for (let level = 1; level <= 40; level++) {
      for (const kind of ['habits', 'packs'] as const) {
        const current = lim.limitsForLevel(level)[kind];
        for (let count = 0; count <= 60; count++) {
          const check = lim.checkAdd({level, kind, count});
          if (check.ok) continue;
          const x = msgLevel(check);
          const needed = Math.max(count, current);
          assert.ok(x > level, `${kind} level ${level} count ${count}: ${x}`);
          assert.ok(lim.limitsForLevel(x)[kind] > needed, `${kind} level ${level} count ${count}: ${x} has room`);
          assert.ok(x - 1 === level || lim.limitsForLevel(x - 1)[kind] <= needed, `${kind} level ${level} count ${count}: ${x} is the lowest`);
          assert.equal(check.message, lim.limitMessageFor(kind, level, count));
        }
      }
    }
  });
});

describe('onboarding: a Settings retake stops at the habit limit', () => {
  test('creates only `room` cards and reports limited; without room (the first run) it creates them all', async () => {
    const pl = plan.buildPlan({
      timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
      derails: 'boredom', sleep: 'good', days: 'predictable', values: ['freedom'], badHabit: 'alcohol', confidence: 5,
    }, {kind: 'none'}, []);
    const run = async (room?: number) => {
      const added: string[] = [];
      const deps = {addHabit: async (input: HabitInput) => { added.push(input.habitName); return 'id'; }, saveRecord: async () => {}, now: () => 1};
      const selected = new Set(pl.picks.map((p) => p.id));
      const result = await plan.createPlannedHabits(deps, {plan: pl, selected, reminderTime: null, session: {created: new Set(), saved: null}, room});
      return {added: added.length, limited: result.limited, total: selected.size};
    };
    const limited = await run(2);
    assert.deepEqual([limited.added, limited.limited], [2, true]);
    const zero = await run(0);
    assert.deepEqual([zero.added, zero.limited], [0, true]);
    const first = await run();
    assert.deepEqual([first.added, first.limited], [first.total, false]);
  });
});

describe('Home layout', () => {
  test('"Create a habit pack" sits below the last pack card with its caption; "Add a habit" is last under "Habits"', () => {
    const home = source('../app/(tabs)/index.tsx');
    const at = (text: string) => {
      const i = home.indexOf(text);
      assert.ok(i >= 0, text);
      return i;
    };
    const cards = at('{groups.packs.map((pack) => (');
    const create = at('onPress={createPackTap}');
    const packCaption = at('{packCaption && ');
    const habitsHeader = at('{HOME_HABITS_TITLE}</Text>');
    const unpacked = at('{groups.unpacked.map(renderToday)}');
    const addHabit = at('onPress={addHabitTap}');
    const habitCaption = at('{limitCaption && ');
    assert.ok(cards < create && create < packCaption && packCaption < habitsHeader, 'create row in the packs section');
    assert.ok(habitsHeader < unpacked && unpacked < addHabit && addHabit < habitCaption, '"Add a habit" last under "Habits"');
    assert.equal(home.match(/onPress=\{createPackTap\}/g)!.length, 1);
    // with no packs: only once packs and stats are known and neither card shows
    assert.match(home, /const showPacks = emptyState !== 'empty' && \(groups\.packs\.length > 0\s*\|\| \(packs !== null && stats !== null && loaded && emptyState === 'hidden' && !chooseCard\)\);/);
  });
});

describe('strings', () => {
  test('the Stage 2 strings are the spec\'s (section 4)', () => {
    const home = SPEC.split(/\r?\n(?=## )/).find((s) => s.startsWith('## 4.'))!;
    for (const text of [
      pc.CREATE_PACK_BUTTON, pc.CREATE_OWN_PACK, pc.EDIT_PACK, pc.NO_HABITS_YET, pc.NEW_PACK_TITLE, pc.PACK_NAME_PLACEHOLDER,
      pc.AREA_LOCKED_NOTE, pc.NO_HABITS_TO_ADD, pc.CREATE_PACK_SAVE, pc.DELETE_PACK, pc.DELETE_PACK_TITLE, pc.DELETE_PACK_BODY,
      pc.SAVE_PACK_FAILED, pc.DELETE_PACK_FAILED, pc.PACK_NOT_FOUND_TITLE, pc.PACK_NOT_FOUND_BODY, pc.PACK_NAME_EMPTY,
      pc.PACK_NAME_LONG, pc.PACK_NAME_TAKEN, pc.HABIT_PACK_LABEL, pc.NO_PACK,
    ]) assert.ok(home.includes(`"${text}"`), text);
    assert.ok(home.includes('"In {pack}"'));
    assert.equal(pc.inPack('Evenings'), 'In Evenings');
    assert.deepEqual(m.AREA_ORDER, ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations']);
  });
});

describe('Job B diagnostic: the last limit check is kept in memory only, numbers only', () => {
  test('the trace holds the time, kind, level, count, adding, room and named level; packLimits keeps it unstored', () => {
    const refused = {level: 3, kind: 'habits' as const, count: 23, adding: 2};
    assert.deepEqual(lim.limitCheckTrace(refused, lim.checkAdd(refused), 1234),
      {at: 1234, kind: 'habits', level: 3, count: 23, adding: 2, room: 0, namedLevel: 7});
    const allowed = {level: 1, kind: 'packs' as const, count: 0};
    assert.deepEqual(lim.limitCheckTrace(allowed, lim.checkAdd(allowed), 5),
      {at: 5, kind: 'packs', level: 1, count: 0, adding: 1, room: 2, namedLevel: null});
    // set by the one check every screen calls, held in a module variable: no storage, no names
    const service = source('../services/packLimits.ts');
    assert.match(service, /const check = checkAdd\(input\);\s*lastCheck = limitCheckTrace\(input, check, Date\.now\(\)\);/);
    assert.doesNotMatch(service, /AsyncStorage|setItem|SecureStore|habitName|\.name\b/);
    // shown only by the hidden trace panel (required lazily by Settings in a trace build)
    assert.match(source('../components/startup-trace-panel.tsx'), /lastLimitCheck\(\)[\s\S]*activeHabitCount\(uid\)/);
  });
});
