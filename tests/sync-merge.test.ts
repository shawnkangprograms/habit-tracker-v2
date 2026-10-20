// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic import below

// sync/merge.ts imports the real validators through "@/...", which the alias hook resolves
const {
  chunk, completionDocId, completionToDoc, docToCompletion, docToHabit, habitToDoc, isPushable, mergeHabit,
  parseCompletionDocId, shouldApplyRemote,
} = await import('../sync/merge.ts');
type LocalHabit = import('../sync/merge.ts').LocalHabit;

const ID = '0f8e4c2a-1b3d-4e5f-8a9b-0c1d2e3f4a5b';
const ID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const habit = (over: Partial<LocalHabit> = {}): LocalHabit => ({
  habitId: ID,
  habitName: 'Read',
  icon: 'book',
  frequencyType: 'weekdays',
  days: ['fri', 'mon', 'wed'],
  reminderTime: '07:30',
  source: 'user',
  createdAt: 1000,
  updatedAt: 2000,
  deleted: false,
  ...over,
});

// a remote doc as Firestore would return it (doc id passed separately)
const docOf = (h: LocalHabit): Record<string, unknown> => ({...habitToDoc(h)});

describe('habit docs', () => {
  test('round trip; days stored Mon..Sun; no habitId or userId in the doc', () => {
    const doc = habitToDoc(habit());
    assert.deepEqual(doc.days, ['mon', 'wed', 'fri']);
    assert.equal('habitId' in doc, false);
    assert.equal('userId' in doc, false);
    assert.deepEqual(docToHabit(ID, doc), habit({days: ['mon', 'wed', 'fri']}));
  });

  test('daily habits store no days', () => {
    assert.deepEqual(habitToDoc(habit({frequencyType: 'daily', days: []})).days, []);
  });

  test("a doc's userId is never returned (the caller sets the signed-in uid)", () => {
    const parsed = docToHabit(ID, {...docOf(habit()), userId: 'someone-else'});
    assert.ok(parsed);
    assert.equal('userId' in parsed, false);
  });

  test('invalid docs are rejected with the app rules (stricter than the Firestore rules)', () => {
    const good = docOf(habit());
    const bad: [string, string, unknown][] = [
      ['bad id', 'not-a-uuid', good],
      ['not an object', ID, null],
      ['31-character name (rules allow 60, the app 30)', ID, {...good, habitName: 'x'.repeat(31)}],
      ['icon from a newer app version', ID, {...good, icon: 'rocket'}],
      ['weekdays with no days', ID, {...good, days: []}],
      ['duplicate day', ID, {...good, days: ['mon', 'mon']}],
      ['bad reminder', ID, {...good, reminderTime: '7:30'}],
      ['missing reminderTime', ID, (({reminderTime, ...rest}) => rest)(good)],
      ['unknown source', ID, {...good, source: 'admin'}],
      ['updatedAt 0', ID, {...good, updatedAt: 0}],
      ['updatedAt as a string', ID, {...good, updatedAt: '2000'}],
      ['deleted as 0/1', ID, {...good, deleted: 0}],
      ['unknown frequency', ID, {...good, frequencyType: 'monthly'}],
    ];
    for (const [label, id, data] of bad) assert.equal(docToHabit(id, data), null, label);
  });
});

describe('completion docs', () => {
  test('doc id round trip, and malformed ids are rejected', () => {
    const id = completionDocId(ID, '2026-10-21');
    assert.deepEqual(parseCompletionDocId(id), {habitId: ID, date: '2026-10-21'});
    assert.equal(parseCompletionDocId(`${ID}2026-10-21`), null);
    assert.equal(parseCompletionDocId(`${ID}_2026-10-21_x`), null);
    assert.equal(parseCompletionDocId(`${ID}_2026-02-30`), null);
    assert.equal(parseCompletionDocId('abc_2026-10-21'), null);
  });

  test('completed must be the int 0 or 1; fields must match the id; updatedAt > 0', () => {
    const row = {habitId: ID, date: '2026-10-21', completed: 1 as const, updatedAt: 5};
    const id = completionDocId(ID, '2026-10-21');
    assert.deepEqual(docToCompletion(id, completionToDoc(row)), row);
    assert.deepEqual(docToCompletion(id, {...row, completed: 0}), {...row, completed: 0});
    assert.equal(docToCompletion(id, {...row, completed: true}), null);
    assert.equal(docToCompletion(id, {...row, completed: 2}), null);
    assert.equal(docToCompletion(id, {...row, updatedAt: 0}), null);
    assert.equal(docToCompletion(id, {...row, date: '2026-10-22'}), null);
    assert.equal(docToCompletion(completionDocId(ID2, '2026-10-21'), row), null);
  });

  test('last-write-wins: no local row or strictly newer remote applies; a tie keeps local', () => {
    assert.equal(shouldApplyRemote(null, 5), true);
    assert.equal(shouldApplyRemote(4, 5), true);
    assert.equal(shouldApplyRemote(5, 5), false);
    assert.equal(shouldApplyRemote(6, 5), false);
  });

  test('system rows (updatedAt 0) never leave the device', () => {
    assert.equal(isPushable(0), false);
    assert.equal(isPushable(1), true);
  });
});

describe('mergeHabit', () => {
  test('no local copy: take the remote one, nothing to push', () => {
    const remote = habit();
    assert.deepEqual(mergeHabit(null, remote), {habit: remote, writeLocal: true, needsPush: false});
  });

  test('remote newer: remote wins and the local row is replaced', () => {
    const result = mergeHabit(habit({habitName: 'Old'}), habit({habitName: 'New', updatedAt: 3000}));
    assert.equal(result.habit.habitName, 'New');
    assert.deepEqual([result.writeLocal, result.needsPush], [true, false]);
  });

  test('local newer: local stays and must be pushed', () => {
    const result = mergeHabit(habit({habitName: 'Mine', updatedAt: 3000}), habit({habitName: 'Theirs'}));
    assert.equal(result.habit.habitName, 'Mine');
    assert.deepEqual([result.writeLocal, result.needsPush], [false, true]);
  });

  test('tie with different content: local wins', () => {
    const result = mergeHabit(habit({habitName: 'Mine'}), habit({habitName: 'Theirs'}));
    assert.equal(result.habit.habitName, 'Mine');
    assert.deepEqual([result.writeLocal, result.needsPush], [false, true]);
  });

  test('identical copies: nothing to do, even if the local days are stored in a different order', () => {
    const same = mergeHabit(habit({days: ['fri', 'mon', 'wed']}), habit({days: ['mon', 'wed', 'fri']}));
    assert.deepEqual([same.writeLocal, same.needsPush], [false, false]);
    assert.deepEqual(same.habit.days, ['mon', 'wed', 'fri']);
  });

  test('sticky delete: a newer remote edit cannot undelete a local delete', () => {
    const result = mergeHabit(
      habit({deleted: true, updatedAt: 2000}),
      habit({habitName: 'Edited elsewhere', deleted: false, updatedAt: 3000}),
    );
    assert.equal(result.habit.deleted, true);
    assert.equal(result.habit.habitName, 'Edited elsewhere');
    assert.equal(result.habit.updatedAt, 3000); // >= the stored one, so the rules accept the push
    assert.deepEqual([result.writeLocal, result.needsPush], [true, true]);
  });

  test('sticky delete: a remote delete wins over a newer local edit, which is then pushed as a tombstone', () => {
    const result = mergeHabit(
      habit({habitName: 'Edited here', deleted: false, updatedAt: 3000}),
      habit({deleted: true, updatedAt: 2000}),
    );
    assert.equal(result.habit.deleted, true);
    assert.equal(result.habit.habitName, 'Edited here');
    assert.equal(result.habit.updatedAt, 3000);
    assert.deepEqual([result.writeLocal, result.needsPush], [true, true]);
  });

  test('createdAt always comes from the remote copy (the server keeps it fixed)', () => {
    const result = mergeHabit(habit({createdAt: 999, updatedAt: 3000}), habit({createdAt: 1000}));
    assert.equal(result.habit.createdAt, 1000);
  });
});

test('chunk splits into Firestore-sized batches', () => {
  const items = Array.from({length: 1000}, (_, i) => i);
  assert.deepEqual(chunk([]), []);
  assert.deepEqual(chunk(items.slice(0, 450)).map((c) => c.length), [450]);
  assert.deepEqual(chunk(items.slice(0, 451)).map((c) => c.length), [450, 1]);
  assert.deepEqual(chunk(items).map((c) => c.length), [450, 450, 100]);
  assert.deepEqual(chunk(items.slice(0, 5), 2), [[0, 1], [2, 3], [4]]);
  assert.throws(() => chunk(items, 0));
});
