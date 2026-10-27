// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {
  afterCheck, afterFetch, readOtaInfo, runUpdateCheck, shouldCheckForUpdate, type UpdatesModule,
} from '../services/otaUpdatesCore.ts';
import {otaLine} from '../utils/startupTrace.ts';

// A fake expo-updates; records which calls were made. There is no reloadAsync on it: calling one would throw.
function fakeUpdates(over: Partial<UpdatesModule> = {}) {
  const calls: string[] = [];
  const mod: UpdatesModule = {
    isEnabled: true,
    updateId: 'abc-123',
    channel: 'preview',
    isEmbeddedLaunch: true,
    checkForUpdateAsync: async () => { calls.push('check'); return {isAvailable: false}; },
    fetchUpdateAsync: async () => { calls.push('fetch'); return {isNew: true}; },
    ...over,
  };
  return {mod, calls};
}

describe('shouldCheckForUpdate', () => {
  test('no module: unavailable; updates off or a dev build: disabled; otherwise check', () => {
    assert.equal(shouldCheckForUpdate(null, false), 'unavailable');
    assert.equal(shouldCheckForUpdate(fakeUpdates({isEnabled: false}).mod, false), 'disabled');// Expo Go
    assert.equal(shouldCheckForUpdate(fakeUpdates().mod, true), 'disabled');// development build
    assert.equal(shouldCheckForUpdate(fakeUpdates().mod, false), 'check');
  });
});

describe('afterCheck and afterFetch', () => {
  test('fetch for a new update or a roll-back directive, nothing otherwise', () => {
    assert.equal(afterCheck({isAvailable: true}), 'fetch');
    assert.equal(afterCheck({isAvailable: false, isRollBackToEmbedded: true}), 'fetch');
    assert.equal(afterCheck({isAvailable: false}), 'none');
  });

  test('fetch results', () => {
    assert.equal(afterFetch({isNew: true}), 'downloaded');
    assert.equal(afterFetch({isNew: false, isRollBackToEmbedded: true}), 'rollback');
    assert.equal(afterFetch({isNew: false}), 'none');
  });
});

describe('runUpdateCheck', () => {
  test('disabled (Expo Go or dev): no calls at all', async () => {
    const off = fakeUpdates({isEnabled: false});
    assert.equal(await runUpdateCheck(off.mod, false), 'disabled');
    const dev = fakeUpdates();
    assert.equal(await runUpdateCheck(dev.mod, true), 'disabled');
    assert.deepEqual([...off.calls, ...dev.calls], []);
    assert.equal(await runUpdateCheck(null, false), 'unavailable');
  });

  test('nothing new: checks, does not download', async () => {
    const {mod, calls} = fakeUpdates();
    assert.equal(await runUpdateCheck(mod, false), 'none');
    assert.deepEqual(calls, ['check']);
  });

  test('a new update: checks, then downloads (and never reloads)', async () => {
    const {mod, calls} = fakeUpdates({
      checkForUpdateAsync: async () => { calls.push('check'); return {isAvailable: true}; },
    });
    assert.equal(await runUpdateCheck(mod, false), 'downloaded');
    assert.deepEqual(calls, ['check', 'fetch']);
  });

  test('a roll-back directive is downloaded too', async () => {
    const {mod} = fakeUpdates({
      checkForUpdateAsync: async () => ({isAvailable: false, isRollBackToEmbedded: true}),
      fetchUpdateAsync: async () => ({isNew: false, isRollBackToEmbedded: true}),
    });
    assert.equal(await runUpdateCheck(mod, false), 'rollback');
  });

  test('never throws: a failing check or download is "failed"', async () => {
    const checkFails = fakeUpdates({checkForUpdateAsync: async () => { throw new Error('offline'); }});
    assert.equal(await runUpdateCheck(checkFails.mod, false), 'failed');
    const fetchFails = fakeUpdates({
      checkForUpdateAsync: async () => ({isAvailable: true}),
      fetchUpdateAsync: async () => { throw new Error('timeout'); },
    });
    assert.equal(await runUpdateCheck(fetchFails.mod, false), 'failed');
  });
});

describe('update info for the trace panel', () => {
  test('reads the running bundle; no module is null', () => {
    assert.deepEqual(readOtaInfo(fakeUpdates().mod), {updateId: 'abc-123', channel: 'preview', embedded: true});
    assert.equal(readOtaInfo(null), null);
  });

  test('the panel line', () => {
    assert.equal(otaLine({updateId: 'abc-123', channel: 'preview', embedded: false, outcome: 'none'}),
      'Update: abc-123 (downloaded) | channel preview | check none');
    assert.equal(otaLine({updateId: null, channel: null, embedded: true, outcome: null}),
      'Update: no id (embedded in the APK) | channel none | check not finished');
    assert.equal(otaLine(undefined), 'Update: n/a');// a record from an older build
  });
});
