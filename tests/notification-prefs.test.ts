// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFS, parseNotificationPrefs, parseStoredNotificationPrefs, reminderSwitchValue,
  shouldAskOnReminderSave, shouldShowSoftPrompt, withDefaults,
} from '../utils/notificationPrefs.ts';

describe('notification prefs', () => {
  test('defaults: habit reminders on, nudge off at 20:30, prompt not answered', () => {
    assert.deepEqual(DEFAULT_NOTIFICATION_PREFS, {remindersOn: true, nudgeOn: false, nudgeTime: '20:30', softPromptDone: false});
    assert.deepEqual(parseNotificationPrefs(null), DEFAULT_NOTIFICATION_PREFS);
  });

  test('a stored remindersOn is always kept, on or off; the default applies only when none is stored', () => {
    assert.equal(parseNotificationPrefs(JSON.stringify({remindersOn: false})).remindersOn, false);
    assert.equal(parseNotificationPrefs(JSON.stringify({remindersOn: true})).remindersOn, true);
    // written by the old full-object save after a soft-prompt answer: an explicit off, kept
    assert.equal(parseNotificationPrefs(JSON.stringify(
      {remindersOn: false, nudgeOn: false, nudgeTime: '20:30', softPromptDone: true})).remindersOn, false);
    // a partial value with no remindersOn (written by the new partial save): the default
    assert.equal(parseNotificationPrefs(JSON.stringify({softPromptDone: true})).remindersOn, true);
  });

  test('corrupt or invalid data counts as nothing stored, field by field', () => {
    assert.deepEqual(parseNotificationPrefs('{oops'), DEFAULT_NOTIFICATION_PREFS);
    assert.deepEqual(parseStoredNotificationPrefs('[1,2]'), {});
    assert.deepEqual(
      parseNotificationPrefs(JSON.stringify({remindersOn: 'yes', nudgeOn: true, nudgeTime: '23:00', softPromptDone: true})),
      {remindersOn: true, nudgeOn: true, nudgeTime: '20:30', softPromptDone: true},
    );
    assert.equal(parseNotificationPrefs(JSON.stringify({nudgeTime: '19:00'})).nudgeTime, '19:00');
  });

  test('only the fields that were saved are read back as stored', () => {
    assert.deepEqual(parseStoredNotificationPrefs(JSON.stringify({nudgeOn: true, nudgeTime: '21:00'})), {nudgeOn: true, nudgeTime: '21:00'});
    // what the service saves after a nudge-only change on a fresh install: remindersOn stays unchosen
    const afterNudge = JSON.stringify({...parseStoredNotificationPrefs(null), nudgeOn: true});
    assert.equal('remindersOn' in parseStoredNotificationPrefs(afterNudge), false);
    assert.equal(withDefaults(parseStoredNotificationPrefs(afterNudge)).remindersOn, true);
  });

  test('soft prompt: shown until answered, never again after any answer, not when the nudge is already on', () => {
    assert.equal(shouldShowSoftPrompt(DEFAULT_NOTIFICATION_PREFS), true);
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, softPromptDone: true}), false);// "Not now" or denied
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, softPromptDone: true, nudgeOn: true}), false);// "Turn on"
    assert.equal(shouldShowSoftPrompt({...DEFAULT_NOTIFICATION_PREFS, nudgeOn: true}), false);// already on via Settings
  });

  test('reminder switch shows the real state: on only with the setting on and permission granted', () => {
    const on = DEFAULT_NOTIFICATION_PREFS;
    const off = {...DEFAULT_NOTIFICATION_PREFS, remindersOn: false};
    assert.equal(reminderSwitchValue(on, 'granted', true), true);
    assert.equal(reminderSwitchValue(on, 'denied', true), false);
    assert.equal(reminderSwitchValue(on, 'undetermined', true), false);
    assert.equal(reminderSwitchValue(on, 'unavailable', true), false);
    assert.equal(reminderSwitchValue(on, null, true), true);// permission still being read: the setting shows
    assert.equal(reminderSwitchValue(on, 'granted', false), false);// no notifications module in this app binary
    assert.equal(reminderSwitchValue(off, 'granted', true), false);
    assert.equal(reminderSwitchValue(off, null, true), false);
  });

  test('saving a reminder asks only while reminders are on and the app has never asked', () => {
    const on = DEFAULT_NOTIFICATION_PREFS;
    const off = {...DEFAULT_NOTIFICATION_PREFS, remindersOn: false};
    assert.equal(shouldAskOnReminderSave(on, 'undetermined'), true);
    assert.equal(shouldAskOnReminderSave(on, 'granted'), false);
    assert.equal(shouldAskOnReminderSave(on, 'denied'), false);
    assert.equal(shouldAskOnReminderSave(on, 'unavailable'), false);
    assert.equal(shouldAskOnReminderSave(off, 'undetermined'), false);// the user turned reminders off
  });
});
