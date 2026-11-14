// Stage A, set 5: an older build must never erase or hide data that a newer build wrote (docs/HABITQUEST_DESIGN.md,
// "Version 1.1 decisions"). Three pieces:
//  (i)   an icon id this build doesn't know is accepted from the server, kept as it came, drawn with a default glyph,
//        and left alone by an edit that doesn't touch the icon (validateIcon's keepIcon);
//  (ii)  every push is a merge write, so a field this build doesn't know stays on the server;
//  (iii) PARSER_VERSION is bumped, so every phone re-reads all docs once and picks up docs an older parser skipped.
// The "old build edits a new doc" stories run the real write paths (db/habits.js), the real engine and merge, and a
// fake Firestore whose commit applies set(..., {merge: true}) when it is given the app's own WRITE_OPTIONS.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {createDevice, createFakeServer, type Device} from './helpers/fake-firestore.ts';

(globalThis as {__uuid?: () => string}).__uuid = randomUUID;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/database') {
      const stub = 'export async function getDatabase() { return globalThis.__tolDb; }';
      return {url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true};
    }
    if (specifier === 'expo-crypto') {
      const stub = 'export function randomUUID() { return globalThis.__uuid(); }';
      return {url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});

const habits = await import('../db/habits.js');
const merge = await import('../sync/merge.ts');
const validators = await import('../validation/validators.ts');
const glyphs = await import('../constants/habitGlyphs.ts');

const UID = 'uid-tolerance';
const T0 = 1_762_000_000_000;
const MIN = 60_000;
const ID = '11111111-1111-4111-8111-111111111111';
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const habitDoc = (extra: Record<string, unknown> = {}) => ({
  habitName: 'Read', icon: 'book', frequencyType: 'daily', days: [], reminderTime: null, alarm: false,
  remindBeforeMin: 0, source: 'user', createdAt: T0, updatedAt: T0, deleted: false, ...extra,
});
const input = (habitName: string, icon: string) => ({
  habitName, icon, frequency: {type: 'daily'}, reminderTime: null, alarm: false, remindBeforeMin: 0,
});

async function onPhone<T>(device: Device, action: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  (globalThis as {__tolDb?: unknown}).__tolDb = device.db;
  Date.now = () => device.clock.now;
  try {
    return await action();
  } finally {
    Date.now = realNow;
  }
}

async function setup() {
  const real = {now: T0 + MIN};
  const server = createFakeServer(() => real.now);
  const a = await createDevice(server, UID, {now: T0 + MIN});
  const b = await createDevice(server, UID, {now: T0 + MIN});
  return {server, a, b};
}

const iconOn = async (d: Device, id: string) =>
  (await d.db.getFirstAsync<{icon: string}>('SELECT icon FROM habits WHERE habitId = ?', [id]))?.icon;

describe('(i) an icon id this build does not know', () => {
  test('docToHabit keeps it as it came, and habitToDoc writes it back unchanged', () => {
    const parsed = merge.docToHabit(ID, habitDoc({icon: 'rocket'}));
    assert.equal(parsed?.icon, 'rocket');
    assert.equal(merge.habitToDoc(parsed!).icon, 'rocket');
    assert.equal(merge.docToHabit(ID, habitDoc({icon: 'book'}))?.icon, 'book');
  });

  test('an icon that is not a plain 1-32 character id still skips the doc', () => {
    for (const icon of ['', 'x'.repeat(33), 'big rocket', 'tab\there', 'é', 5, null, undefined, {}]) {
      assert.equal(merge.docToHabit(ID, habitDoc({icon})), null, JSON.stringify(icon));
    }
    assert.ok(merge.docToHabit(ID, habitDoc({icon: 'x'.repeat(32)})));
  });

  test('validateIcon: an unknown id passes only when it equals the icon the habit already has', () => {
    const {validateIcon, validateHabitInput} = validators;
    assert.equal(validateIcon('rocket').valid, false);
    assert.equal(validateIcon('rocket', null).valid, false);
    assert.equal(validateIcon('rocket', 'comet').valid, false);
    assert.equal(validateIcon('rocket', 'rocket').valid, true);
    assert.equal(validateIcon('book', 'rocket').valid, true); // choosing a known icon is always fine
    assert.equal(validateIcon('big rocket', 'big rocket').valid, false); // the kept id must still be a plain id
    assert.equal(validateIcon(5, '5').valid, false);
    assert.equal(validateIcon(null, 'rocket').valid, false);

    const base = {habitName: 'Read', frequency: {type: 'daily'}, reminderTime: null};
    assert.equal(validateHabitInput({...base, icon: 'rocket'}).valid, false);
    assert.equal(validateHabitInput({...base, icon: 'rocket'}, {keepIcon: 'rocket'}).valid, true);
    assert.equal(validateHabitInput({...base, icon: 'rocket'}, {keepIcon: 'comet'}).valid, false);
  });

  test('glyphFor: known ids map to their glyph, anything else to the default (never a prototype key)', () => {
    assert.equal(glyphs.glyphFor('book'), glyphs.HABIT_ICONS.book);
    assert.equal(glyphs.glyphFor('rocket'), glyphs.FALLBACK_GLYPH);
    assert.equal(glyphs.glyphFor(''), glyphs.FALLBACK_GLYPH);
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(glyphs.glyphFor(key), glyphs.FALLBACK_GLYPH, key);
    }
    assert.equal(glyphs.FALLBACK_GLYPH, glyphs.HABIT_ICONS.star);
  });

  test('a name-only edit on this phone keeps the unknown icon, on the phone and on the server', async () => {
    const {server, a} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({icon: 'rocket'})}]);
    await a.engine.requestSync();
    assert.equal(await iconOn(a, ID), 'rocket'); // pulled, not skipped

    a.clock.now = T0 + 10 * MIN;
    await onPhone(a, () => habits.updateHabit(UID, ID, input('Read more', 'rocket'))); // what the form sends untouched
    assert.equal(await iconOn(a, ID), 'rocket');
    await a.engine.requestSync();
    assert.deepEqual(server.rejections, []);
    assert.equal(server.get(UID, 'habits', ID)?.icon, 'rocket');
    assert.equal(server.get(UID, 'habits', ID)?.habitName, 'Read more');
  });

  test('updateHabit refuses an unknown icon the habit does not have, and a known habit refuses any unknown icon', async () => {
    const {server, a} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({icon: 'rocket'})}]);
    await a.engine.requestSync();
    await assert.rejects(onPhone(a, () => habits.updateHabit(UID, ID, input('Read', 'comet'))), /choose an icon/i);
    assert.equal(await iconOn(a, ID), 'rocket');

    const known = await onPhone(a, () => habits.addHabit(UID, input('Walk', 'run'))) as string;
    await assert.rejects(onPhone(a, () => habits.updateHabit(UID, known, input('Walk', 'rocket'))), /choose an icon/i);
    await onPhone(a, () => habits.updateHabit(UID, known, input('Walk far', 'run'))); // a normal edit still works
    assert.equal(await iconOn(a, known), 'run');
  });

  test('choosing an icon replaces the unknown one, and that choice reaches the server', async () => {
    const {server, a} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({icon: 'rocket'})}]);
    await a.engine.requestSync();
    a.clock.now = T0 + 10 * MIN;
    await onPhone(a, () => habits.updateHabit(UID, ID, input('Read', 'star')));
    await a.engine.requestSync();
    assert.equal(server.get(UID, 'habits', ID)?.icon, 'star');
  });

  test('a second phone pulls the unknown icon and shows the rename (nothing hidden)', async () => {
    const {server, a, b} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({icon: 'rocket'})}]);
    await a.engine.requestSync();
    a.clock.now = T0 + 10 * MIN;
    await onPhone(a, () => habits.updateHabit(UID, ID, input('Read more', 'rocket')));
    await a.engine.requestSync();
    b.clock.now = T0 + 20 * MIN;
    await b.engine.requestSync();
    assert.equal(await iconOn(b, ID), 'rocket');
  });
});

describe('(ii) pushes are merge writes: an older build edits a newer build\'s doc', () => {
  test('a field this build does not know is still on the server after this phone edits and pushes', async () => {
    const {server, a} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({icon: 'rocket', targetDays: 21, futureNote: 'keep me'})}]);
    await a.engine.requestSync();

    a.clock.now = T0 + 10 * MIN;
    await onPhone(a, () => habits.updateHabit(UID, ID, input('Read more', 'rocket')));
    await a.engine.requestSync();
    assert.deepEqual(server.rejections, []);
    const doc = server.get(UID, 'habits', ID)!;
    assert.equal(doc.habitName, 'Read more');
    assert.equal(doc.targetDays, 21, 'the unknown field was erased by the old build');
    assert.equal(doc.futureNote, 'keep me');
    assert.equal(doc.icon, 'rocket');
  });

  test('a soft delete and a tick from the older phone keep the unknown fields too', async () => {
    const {server, a} = await setup();
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({targetDays: 21})}]);
    server.commit(UID, 'completions', [{
      id: `${ID}_2025-11-01`, data: {habitId: ID, date: '2025-11-01', completed: 0, updatedAt: T0, amountDone: 3},
    }]);
    await a.engine.requestSync();
    a.clock.now = T0 + 10 * MIN;
    await onPhone(a, () => habits.softDeleteHabit(UID, ID));
    await a.db.runAsync(
      'UPDATE completions SET completed = 1, updatedAt = ?, synced = 0 WHERE habitId = ? AND date = ?', [T0 + 10 * MIN, ID, '2025-11-01']);
    await a.engine.requestSync();
    assert.deepEqual(server.rejections, []);
    assert.equal(server.get(UID, 'habits', ID)?.targetDays, 21);
    assert.equal(server.get(UID, 'habits', ID)?.deleted, true);
    assert.equal(server.get(UID, 'completions', `${ID}_2025-11-01`)?.amountDone, 3);
    assert.equal(server.get(UID, 'completions', `${ID}_2025-11-01`)?.completed, 1);
  });

  test('what the merge prevents: a whole-document write from the same phone erases the unknown field', () => {
    const server = createFakeServer(() => T0 + MIN);
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({targetDays: 21})}]);
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({habitName: 'Read more', updatedAt: T0 + 1})}]); // no options
    assert.equal(server.get(UID, 'habits', ID)?.targetDays, undefined);
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({targetDays: 21, updatedAt: T0 + 2})}]);
    server.commit(UID, 'habits', [{id: ID, data: habitDoc({habitName: 'Read most', updatedAt: T0 + 3})}], merge.WRITE_OPTIONS);
    assert.equal(server.get(UID, 'habits', ID)?.targetDays, 21);
  });
});

describe('the write payloads', () => {
  test('WRITE_OPTIONS is a merge, and both pushes in firestoreRemote.js use it', () => {
    assert.deepEqual(merge.WRITE_OPTIONS, {merge: true});
    const remote = source('../sync/firestoreRemote.js');
    const sets = remote.match(/batch\.set\([\s\S]*?\);/g) ?? [];
    const dataSets = sets.filter((s) => /'(habits|completions)'/.test(s));
    assert.equal(dataSets.length, 2);
    for (const s of dataSets) assert.match(s, /WRITE_OPTIONS\)/, s);
  });

  test('the fields written equal the fields firestore.rules allows (a rules or app change must update both)', () => {
    const rules = source('../firestore.rules');
    const list = (text: string) => [...text.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    const habitBlock = rules.slice(rules.indexOf('function syncValidHabit'), rules.indexOf('function syncValidCompletion'));
    const habitFields = list(habitBlock.match(/let fields = \[([\s\S]*?)\];/)![1]);
    const optional = list(habitBlock.match(/hasOnly\(fields\.concat\(\[([^\]]*)\]\)\)/)![1]);
    const completionBlock = rules.slice(rules.indexOf('function syncValidCompletion'));
    const completionFields = list(completionBlock.match(/let fields = \[([\s\S]*?)\];/)![1]);

    const doc = merge.habitToDoc(merge.docToHabit(ID, habitDoc())!);
    assert.deepEqual(
      [...Object.keys(merge.habitWriteFields(doc)), 'serverUpdatedAt'].sort(),
      [...habitFields, ...optional].sort());
    assert.deepEqual(
      [...Object.keys(merge.completionWriteFields({habitId: ID, date: '2025-11-01', completed: 1, updatedAt: T0})), 'serverUpdatedAt'].sort(),
      [...completionFields].sort());
  });

  test('PARSER_VERSION is 3: the unknown-icon docs older parsers skipped are read once', () => {
    assert.equal(merge.PARSER_VERSION, 3);
  });
});

describe('the habit form', () => {
  test('saving without choosing an icon passes the kept icon to the validators and to updateHabit', () => {
    const form = source('../app/habit-form.tsx');
    assert.match(form, /const iconValue = icon \?\? keptIcon;/);
    assert.match(form, /validateIcon\(iconValue, keptIcon\)/);
    assert.match(form, /icon: iconValue, frequency, reminderTime,[\s\S]*?\{keepIcon: keptIcon\}\)/);
    assert.match(form, /setKeptIcon\(isKnownIcon\(habit\.icon\) \? null : habit\.icon\)/);
  });
});
