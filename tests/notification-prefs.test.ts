// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFS, parseNotificationPrefs, shouldShowSoftPrompt,
} from '../utils/notificationPrefs.ts';

describe('notification prefs', () => {
  test('defaults: everything off, nudge at 20:30, prompt not answered', () => {
    assert.deepEqual(DEFAULT_NOTIFICATION_PREFS, {remindersOn: false, nudgeOn: false, nudgeTime: '20:30', softPromptDone: false});
    assert.deepEqual(parseNotificationPrefs(null), DEFAULT_NOTIFICATION_PREFS);
  });

  test('corrupt or invalid data falls back to the defaults, field by field', () => {
    assert.deepEqual(parseNotificationPrefs('{oops'), DEFAULT_NOTIFICATION_PREFS);
    assert.deepEqual(parseNotificationPrefs('[1,2]').remindersOn, false);
    assert.deepEqual(
      parseNotificationPrefs(JSON.stringify({remindersOn: 'yes', nudgeOn: true, nudgeTime: '23:00', softPromptDone: true})),
      {remindersOn: false, nudgeOn: true, nudgeTime: '20:30', softPromptDone: true},
    );
    assert.equal(parseNotificationPrefs(JSON.stringify({nudgeTime: '19:00'})).nudgeTime, '19:00');
  });

  test('soft prompt: shown until answered, never again after any answer, not when the nudge is already on', () => {
    assert.equal(shouldShowSoftPrompt(DEFAULT_NOTIFICATION_PREFS), true);
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, softPromptDone: true}), false);// "Not now" or denied
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, softPromptDone: true, nudgeOn: true}), false);// "Turn on"
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, nudgeOn: true}), false);// already on via Settings
  });
});
