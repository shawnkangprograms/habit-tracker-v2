// When onboarding opens on its own (utils/onboarding/gate.ts), what Skip writes, and the record's storage
// (services/onboardingStoreCore.ts) with a Map as storage. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below

import type {KeyValueStorage} from '@/services/celebratedStore';
import type {ParsedRecord} from '../utils/onboarding/record.ts';

const g = await import('../utils/onboarding/gate.ts');
const r = await import('../utils/onboarding/record.ts');
const {createOnboardingStore} = await import('../services/onboardingStoreCore.ts');

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
const opens = (home: HomeState, record: ParsedRecord, pending: boolean) =>
  g.shouldCheckOnboarding(home) && g.shouldAutoShowOnboarding(record, pending);

describe('auto-show gate', () => {
  const NONE: ParsedRecord = {kind: 'none'};
  const NEW_USER: HomeState = {loaded: true, activeCount: 0, firstPullDone: true, waitOver: false};

  test('opens only for: list loaded, zero habits, restore finished, no record, signed up on this phone', () => {
    assert.equal(opens(NEW_USER, NONE, true), true);
  });

  test('an existing account or a later sign-in (no pending flag) never opens it, even with zero habits', () => {
    assert.equal(opens(NEW_USER, NONE, false), false);
  });

  test('truth table: any one condition missing keeps it closed', () => {
    const records: ParsedRecord[] = [
      NONE, {kind: 'corrupt'}, {kind: 'ok', record: r.skippedRecord()}, {kind: 'ok', record: r.completedRecord(null, 1)},
    ];
    for (const loaded of [false, true]) {
      for (const activeCount of [null, 0, 1, 5]) {
        for (const firstPullDone of [false, true]) {
          for (const waitOver of [false, true]) {
            for (const record of records) {
              for (const pending of [false, true]) {
                const expected = loaded && activeCount === 0 && firstPullDone && record.kind === 'none' && pending;
                const home = {loaded, activeCount, firstPullDone, waitOver};
                assert.equal(opens(home, record, pending), expected, JSON.stringify({...home, record: record.kind, pending}));
              }
            }
          }
        }
      }
    }
  });

  test('the pending flag: only the exact set value counts', () => {
    assert.equal(g.pendingKey('u1'), 'onboarding:pending:v1:u1');
    assert.equal(g.parsePending(g.PENDING_SET), true);
    for (const raw of [null, g.PENDING_CLEARED, '', 'true', 'yes']) assert.equal(g.parsePending(raw), false, String(raw));
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
    assert.equal(g.shouldAutoShowOnboarding(r.parseRecord(r.serialiseRecord(record!)), true), false);
  });

  test('"Skip setup" from Settings writes nothing', () => {
    assert.equal(g.recordOnSkip('settings'), null);
  });

  test('Q10 "Skip this one" finishes with no Q10 and no replace habit in the record', () => {
    const json = r.serialiseRecord(r.completedRecord(null, 1));
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

  test('a record carrying answers (Q10 included) is saved and remembered without them', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    const tampered = {...r.completedRecord(null, 1), answers: {occupation: 'student', badHabit: 'alcohol'}} as unknown as Parameters<typeof store.write>[1];
    await store.write('u1', tampered);
    assert.equal(storage.data.get('onboarding:v1:u1')!.includes('alcohol'), false);
    const read = await store.read('u1');
    assert.ok(read.kind === 'ok' && read.record.answers === null);
  });
});

describe('sign-up pending flag', () => {
  test('not set reads false; a mark is read back at once and by a fresh store (next launch)', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    assert.equal(await store.isPending('u1'), false);
    await store.markPending('u1');
    assert.equal(await store.isPending('u1'), true);
    assert.equal(storage.data.get('onboarding:pending:v1:u1'), g.PENDING_SET);
    assert.equal(await createOnboardingStore(storage).isPending('u1'), true);
    assert.equal(await store.isPending('u2'), false);
  });

  test('finishing (a completed record) clears it', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    await store.markPending('u1');
    await store.write('u1', r.completedRecord(null, 1));
    assert.equal(await store.isPending('u1'), false);
    assert.equal(await createOnboardingStore(storage).isPending('u1'), false);
  });

  test('skipping (a skip record) clears it', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    await store.markPending('u1');
    await store.write('u1', r.skippedRecord());
    assert.equal(await createOnboardingStore(storage).isPending('u1'), false);
  });

  test('killed before the first habit: on relaunch the flag is still set and there is no record, so it reopens', async () => {
    const storage = mapStorage();
    await createOnboardingStore(storage).markPending('u1');
    const relaunched = createOnboardingStore(storage);
    const [record, pending] = await Promise.all([relaunched.read('u1'), relaunched.isPending('u1')]);
    assert.equal(g.shouldAutoShowOnboarding(record, pending), true);
  });

  test('a failed sign-up (profile rolled back) clears it', async () => {
    const storage = mapStorage();
    const store = createOnboardingStore(storage);
    await store.markPending('u1');
    await store.clearPending('u1');
    assert.equal(await createOnboardingStore(storage).isPending('u1'), false);
  });

  test('unreadable storage reads as not pending (never opens on a guess)', async () => {
    const store = createOnboardingStore({getItem: async () => { throw new Error('disk'); }, setItem: async () => {}});
    assert.equal(await store.isPending('u1'), false);
  });

  test('the Settings entry does not depend on the flag: Skip from Settings writes nothing', () => {
    assert.equal(g.recordOnSkip('settings'), null);
  });

  test('sign-up sets it after the account exists (and its details are saved) and before the profile write; never cleared by sign-up', () => {
    const source = readFileSync(new URL('../services/authActions.js', import.meta.url), 'utf8');
    const signUp = source.slice(source.indexOf('export async function signUp'), source.indexOf('export async function signIn'));
    const at = (needle: string) => signUp.indexOf(needle);
    assert.ok(at('createUserWithEmailAndPassword(') >= 0 && at('createUserWithEmailAndPassword(') < at('markPending(uid)'));
    assert.ok(at('profileCompletion.savePending(uid, profile)') < at('markPending(uid)'));
    assert.ok(at('markPending(uid)') < at('profileCompletion.writeNow(uid, profile)'));
    // no rollback any more (the orphan-account fix): sign-up never clears the flag
    assert.equal(at('clearPending('), -1);
    // the only caller: sign-in never sets it
    assert.equal(source.split('markPending').length - 1, 1);
  });
});
