// When onboarding opens on its own (utils/onboarding/gate.ts), what Skip writes, and the record's storage
// (services/onboardingStoreCore.ts) with a Map as storage. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {KeyValueStorage} from '@/services/celebratedStore';
import type {CompleteAnswers} from '../utils/onboarding/types.ts';
import type {ParsedRecord} from '../utils/onboarding/record.ts';

const g = await import('../utils/onboarding/gate.ts');
const r = await import('../utils/onboarding/record.ts');
const {createOnboardingStore} = await import('../services/onboardingStoreCore.ts');

const ANSWERS: CompleteAnswers = {
  age: '18_24', occupation: 'student', habitsFeel: 'alright', focus: ['education'], challenge: 'memory',
  derails: 'boredom', sleep: 'good', days: 'mostly', values: ['achievement'], badHabit: null, confidence: 5,
};

function mapStorage(initial: Record<string, string> = {}): KeyValueStorage & {data: Map<string, string>; reads: number} {
  const data = new Map(Object.entries(initial));
  const storage = {
    data,
    reads: 0,
    getItem: async (key: string) => {
      storage.reads += 1;
      return data.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
  return storage;
}

// Home's whole state, as Home has it: waitOver is there on purpose, and must never matter
type HomeState = {loaded: boolean; activeCount: number | null; firstPullDone: boolean; waitOver: boolean};
const opens = (home: HomeState, record: ParsedRecord) => g.shouldCheckOnboarding(home) && g.shouldAutoShowOnboarding(record);

describe('auto-show gate', () => {
  const NONE: ParsedRecord = {kind: 'none'};
  const NEW_USER: HomeState = {loaded: true, activeCount: 0, firstPullDone: true, waitOver: false};

  test('opens only for: list loaded, zero habits, restore finished, no record', () => {
    assert.equal(opens(NEW_USER, NONE), true);
  });

  test('truth table: any one condition missing keeps it closed', () => {
    const records: ParsedRecord[] = [
      NONE, {kind: 'corrupt'}, {kind: 'ok', record: r.skippedRecord()}, {kind: 'ok', record: r.completedRecord(null, ANSWERS, 1)},
    ];
    for (const loaded of [false, true]) {
      for (const activeCount of [null, 0, 1, 5]) {
        for (const firstPullDone of [false, true]) {
          for (const waitOver of [false, true]) {
            for (const record of records) {
              const expected = loaded && activeCount === 0 && firstPullDone && record.kind === 'none';
              const home = {loaded, activeCount, firstPullDone, waitOver};
              assert.equal(opens(home, record), expected, JSON.stringify({...home, record: record.kind}));
            }
          }
        }
      }
    }
  });

  test('a reinstall still restoring never opens it, even after the wait is over (offline or 15 s)', () => {
    assert.equal(g.shouldCheckOnboarding({loaded: true, activeCount: 0, firstPullDone: false, waitOver: true} as HomeState), false);
  });

  test('users with habits never even read the record', () => {
    assert.equal(g.shouldCheckOnboarding({...NEW_USER, activeCount: 3}), false);
  });
});

describe('skip paths', () => {
  test('"Skip setup" on the first run writes a skip record, which keeps it closed from then on', () => {
    const record = g.recordOnSkip('auto');
    assert.deepEqual(record, r.skippedRecord());
    assert.equal(g.shouldAutoShowOnboarding(r.parseRecord(r.serialiseRecord(record!))), false);
  });

  test('"Skip setup" from Settings writes nothing', () => {
    assert.equal(g.recordOnSkip('settings'), null);
  });

  test('Q10 "Skip this one" finishes with no Q10 and no replace habit in the record', () => {
    const json = r.serialiseRecord(r.completedRecord(null, {...ANSWERS, badHabit: null}, 1));
    assert.doesNotMatch(json, /badHabit|replace/);
  });

  test('the entry param: only "settings" means Settings', () => {
    assert.equal(g.entryFromParam('settings'), 'settings');
    for (const p of [undefined, '', 'auto', 'Settings', ['settings'], 1]) assert.equal(g.entryFromParam(p), 'auto', String(p));
  });
});

describe('onboarding record store', () => {
  test('nothing stored reads as none, under onboarding:v1:<uid>', async () => {
    const storage = mapStorage();
    assert.deepEqual(await createOnboardingStore(storage).read('u1'), {kind: 'none'});
  });

  test('a write is read back at once, saved under the uid key, and read by a fresh store (next launch)', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    await store.write('u1', r.skippedRecord());
    assert.deepEqual(await store.read('u1'), {kind: 'ok', record: r.skippedRecord()});
    assert.ok(storage.data.has('onboarding:v1:u1'));
    assert.deepEqual(await createOnboardingStore(storage).read('u1'), {kind: 'ok', record: r.skippedRecord()});
  });

  test('per uid: one user\'s record never answers for another', async () => {
    const store = createOnboardingStore(mapStorage());
    await store.write('u1', r.skippedRecord());
    assert.deepEqual(await store.read('u2'), {kind: 'none'});
  });

  test('storage is read once per uid per app run', async () => {
    const storage = mapStorage({'onboarding:v1:u1': r.serialiseRecord(r.skippedRecord())});
    const store = createOnboardingStore(storage);
    await store.read('u1');
    await store.read('u1');
    assert.equal(storage.reads, 1);
  });

  test('unreadable storage reads as corrupt (never opens on a guess) and is retried next time', async () => {
    let fail = true;
    const store = createOnboardingStore({
      getItem: async () => {
        if (fail) throw new Error('disk');
        return null;
      },
      setItem: async () => {},
    });
    assert.deepEqual(await store.read('u1'), {kind: 'corrupt'});
    fail = false;
    assert.deepEqual(await store.read('u1'), {kind: 'none'});
  });

  test('a failed save never throws, and the record still holds for this app run', async () => {
    const store = createOnboardingStore({getItem: async () => null, setItem: async () => { throw new Error('full'); }});
    await store.write('u1', r.skippedRecord());
    assert.equal((await store.read('u1')).kind, 'ok');
  });

  test('a record carrying Q10 is saved and remembered without it', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    const tampered = {...r.completedRecord(null, ANSWERS, 1), answers: {...ANSWERS, badHabit: 'alcohol'}} as unknown as Parameters<typeof store.write>[1];
    await store.write('u1', tampered);
    assert.equal(storage.data.get('onboarding:v1:u1')!.includes('alcohol'), false);
    const read = await store.read('u1');
    assert.ok(read.kind === 'ok' && read.record.answers && !('badHabit' in read.record.answers));
  });
});
