// P-2 (docs/PACKS_REPORTS_SPEC.md, section 17): a template habit renamed or deleted leaves its built-in pack's
// templates (`dropped`), so "Add the rest" doesn't create it again; renaming back puts it back. P2-1 to P2-5, a rename
// with a move, two templates, deletes, and the R-1, P-8 and read-failure rules.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';

const PM = await import('../utils/packs/manage.ts');
const PR = await import('../utils/packs/record.ts');
const {addTheRest} = await import('../utils/packs/addRest.ts');
const {missingTemplates} = await import('../utils/packs/membership.ts');
const {joinTarget} = await import('../utils/packs/choose.ts');
const {createPacksStore} = await import('../services/packsStoreCore.ts');
const {TEMPLATE_NAMES} = await import('../utils/onboarding/copy.ts');

type Ref = {habitId: string; habitName: string};
const WALK = TEMPLATE_NAMES.walk20;
const STRETCH = TEMPLATE_NAMES.stretch10;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const record = (steady: string[], dropped: string[] = [], extra: Record<string, unknown> = {}) => PR.packsFromValue({version: 1, packs: [
  {id: 'steady_energy', kind: 'builtin', builtinId: 'steady_energy', name: 'Steady Energy', habitIds: steady, dropped, createdAt: 1, order: 0, ...extra},
  {id: 'c1', kind: 'custom', name: 'Evenings', habitIds: ['u1'], dropped: [], createdAt: 2, order: 1, area: 'Mind'},
]})!;
const steady = (r: ReturnType<typeof record>) => r.packs.find((p) => p.id === 'steady_energy')!;

// "Add the rest" on Steady Energy with these active habits: the names it creates
async function addRest(r: ReturnType<typeof record>, active: Ref[]): Promise<string[]> {
  const made: string[] = [];
  await addTheRest({
    addHabit: async (input) => {
      made.push(input.habitName);
      return `new-${made.length}`;
    },
    savePacks: async () => {},
  }, {record: r, packId: 'steady_energy', habits: active, level: 10, reminderTime: null});
  return made;
}

describe('P-2: renames', () => {
  test('P2-1: renaming the only "Walk for 20 minutes" puts walk20 in dropped; "Add the rest" then creates nothing for it', async () => {
    const before = record(['w']);
    const active = [{habitId: 'w', habitName: 'Evening walk'}];
    const after = PM.renameInPack(before, {habitId: 'w', oldName: WALK, newName: 'Evening walk'}, active);
    assert.deepEqual(steady(after).dropped, ['walk20']);
    const made = await addRest(after, active);
    assert.equal(made.includes(WALK), false);
    assert.ok(made.length > 0, 'the other missing templates are still created');
    assert.ok((await addRest(before, active)).includes(WALK), 'without P-2 it would have been created again');
  });

  test('P2-2: renaming one of two members carrying that name changes nothing', () => {
    const r = record(['w1', 'w2']);
    const active = [{habitId: 'w1', habitName: 'Evening walk'}, {habitId: 'w2', habitName: WALK}];
    assert.equal(PM.renameInPack(r, {habitId: 'w1', oldName: WALK, newName: 'Evening walk'}, active), r);
  });

  test('P2-3: renaming it back to the template name takes walk20 out of dropped', async () => {
    const r = record(['w'], ['walk20']);
    const active = [{habitId: 'w', habitName: WALK}];
    const after = PM.renameInPack(r, {habitId: 'w', oldName: 'Evening walk', newName: `  walk FOR 20 minutes `}, active);
    assert.deepEqual(steady(after).dropped, []);
    assert.equal((await addRest(after, active)).includes(WALK), false, 'present again, so not created');
  });

  test('P2-4: renaming an unpacked habit or one in a custom pack changes no pack', () => {
    const r = record(['w']);
    assert.equal(PM.renameInPack(r, {habitId: 'loose', oldName: WALK, newName: 'Evening walk'}, []), r);
    assert.equal(PM.renameInPack(r, {habitId: 'u1', oldName: WALK, newName: 'Evening walk'}, []), r);
  });

  test('P2-5: a rename that only changes case or spacing is not a rename of the template', () => {
    const r = record(['w']);
    assert.equal(PM.renameInPack(r, {habitId: 'w', oldName: WALK, newName: '  walk for 20   MINUTES'}, []), r);
  });

  test('a rename from one template\'s name to another\'s in the same pack drops the first and puts the second back', () => {
    const r = record(['w'], ['stretch10']);
    const after = PM.renameInPack(r, {habitId: 'w', oldName: WALK, newName: STRETCH}, [{habitId: 'w', habitName: STRETCH}]);
    assert.deepEqual(steady(after).dropped, ['walk20']);
  });

  test('a rename with a move (as the habit form runs them): the old pack drops its template; moving in puts one back', () => {
    // out of Steady Energy into the custom pack, renamed at the same time
    let r = record(['w']);
    const active = [{habitId: 'w', habitName: 'Evening walk'}];
    r = PM.renameInPack(r, {habitId: 'w', oldName: WALK, newName: 'Evening walk'}, active);
    r = PM.moveHabit(r, {habitId: 'w', habitName: 'Evening walk'}, 'c1');
    assert.deepEqual(steady(r).dropped, ['walk20']);
    assert.deepEqual(r.packs.find((p) => p.id === 'c1')!.dropped, []);
    // an unpacked habit renamed to a dropped template's name and moved into Steady Energy
    let s = record([], ['walk20']);
    s = PM.renameInPack(s, {habitId: 'x', oldName: 'Morning walk', newName: WALK}, [{habitId: 'x', habitName: WALK}]);
    s = PM.moveHabit(s, {habitId: 'x', habitName: WALK}, 'steady_energy');
    assert.deepEqual([steady(s).dropped, steady(s).habitIds], [[], ['x']]);
  });

  test('the habit form: rename first (old pack, old name), then the move; an unreadable active list makes no P-2 change', () => {
    const form = source('app/habit-form.tsx');
    assert.match(form, /const active = renamed \? await activeRefs\(userId\) : null;/);
    assert.match(form, /if \(renamed && active && habitId && loadedName !== null\) \{\s*next = renameInPack\(next, \{habitId, oldName: loadedName, newName: input\.value\.habitName\}, active\);\s*\}\s*if \(packChoice !== initialPack\) next = moveHabit\(next, habit, packChoice\);/);
    assert.match(form, /\.catch\(\(\) => null\);/);
  });
});

describe('P-2: deletes', () => {
  test('deleting the only walk20 puts it in dropped: "Add the rest" creates nothing for it', async () => {
    const before = record(['w', 's']);
    const active = [{habitId: 's', habitName: STRETCH}];// w is deleted: no longer active
    const after = PM.deleteFromPack(before, {habitId: 'w', habitName: WALK}, active);
    assert.deepEqual(steady(after).dropped, ['walk20']);
    assert.deepEqual(steady(after).habitIds, ['w', 's'], 'ids of deleted habits stay (ignored on read)');
    assert.equal((await addRest(after, active)).includes(WALK), false);
    assert.ok((await addRest(before, active)).includes(WALK), 'without P-2 it would have been created again');
  });

  test('deleting one of two carriers changes nothing', () => {
    const r = record(['w1', 'w2']);
    assert.equal(PM.deleteFromPack(r, {habitId: 'w1', habitName: WALK}, [{habitId: 'w2', habitName: WALK}]), r);
  });

  test('deleting an unpacked habit, one in a custom pack, or one carrying no template name changes nothing', () => {
    const r = record(['n']);
    assert.equal(PM.deleteFromPack(r, {habitId: 'loose', habitName: WALK}, []), r);
    assert.equal(PM.deleteFromPack(r, {habitId: 'u1', habitName: WALK}, []), r);
    assert.equal(PM.deleteFromPack(r, {habitId: 'n', habitName: 'Guitar'}, []), r);
  });

  test('every path that deletes a habit runs the rule; there is no undo-delete path', () => {
    const callers: string[] = [];
    const root = new URL('../', import.meta.url);
    for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'sync']) {
      for (const entry of readdirSync(new URL(`${dir}/`, root), {recursive: true}) as string[]) {
        const path = `${dir}/${entry.replaceAll('\\', '/')}`;
        if (/\.(ts|tsx|js)$/.test(path) && /softDeleteHabit\(/.test(source(path))) callers.push(path);
      }
    }
    assert.deepEqual(callers, ['app/habit-form.tsx']);
    const form = source('app/habit-form.tsx');
    assert.match(form, /await softDeleteHabit\(userId, habitId\);\s*\/\/ P-2[\s\S]*?const next = deleteFromPack\(parsed\.record, deleted, active\);/);
    // sync never undeletes (the rules refuse it), and no screen offers an undo
    assert.doesNotMatch(source('db/habits.js'), /deleted = 0,/);
  });
});

describe('P-2 with R-1 and P-8', () => {
  test('R-1: a pack record that can\'t be read is never written; the rename or delete still happened (silent)', async () => {
    const m = kvStorage({[PR.packsKey('uid')]: PR.serialisePacks(record(['w']))});
    m.failReads([PR.packsKey('uid')]);
    const store = createPacksStore(m);
    const active = [{habitId: 'w', habitName: 'Evening walk'}];
    const result = await store.update('uid', (parsed) => (parsed.kind === 'ok'
      ? PM.renameInPack(parsed.record, {habitId: 'w', oldName: WALK, newName: 'Evening walk'}, active) : null));
    assert.equal(result, 'unreadable');
    assert.deepEqual(m.writes(), []);
    assert.equal(source('app/habit-form.tsx').match(/unreadable: \(\) => \{\}/g)?.length, 2);
  });

  test('P-8: a pack\'s unknown fields survive a rename or a delete', () => {
    const r = record(['w'], [], {futureField: 7});
    const renamed = PM.renameInPack(r, {habitId: 'w', oldName: WALK, newName: 'Evening walk'}, []);
    const deleted = PM.deleteFromPack(r, {habitId: 'w', habitName: WALK}, []);
    for (const next of [renamed, deleted]) {
      const saved = JSON.parse(PR.serialisePacks(next));
      assert.deepEqual([saved.packs[0].futureField, saved.packs[0].dropped], [7, ['walk20']]);
    }
  });

  test('retake (no change): a dropped template\'s starter joins no pack', () => {
    const r = PM.renameInPack(record(['w']), {habitId: 'w', oldName: WALK, newName: 'Evening walk'}, []);
    assert.equal(joinTarget(r, 'walk20'), null);
    assert.deepEqual(missingTemplates(r, 'steady_energy', []), ['stretch10', 'water_meals', 'eat_produce']);
  });
});
