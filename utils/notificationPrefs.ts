// Notification settings (per device). Pure: defaults, parsing, the soft-prompt rule and the reminder switch
// rules; storage lives in services/notificationPrefs.ts. Habit reminders are ON by default; the evening nudge
// is OFF until the user turns it on. A default applies only to a field with no stored choice: a stored
// remindersOn, true or false, is always kept.

import type {PermissionState} from '@/services/notificationsCore';
import {collectUnknown, isPlainObject, withUnknown, type UnknownFields} from '@/utils/unknownFields';

export const NUDGE_TIMES = ['19:00', '20:00', '20:30', '21:00'] as const;
export type NudgeTime = (typeof NUDGE_TIMES)[number];

export type NotificationPrefs = {
  remindersOn: boolean;// per-habit reminders at each habit's reminderTime
  nudgeOn: boolean;// one evening nudge per day
  nudgeTime: NudgeTime;
  softPromptDone: boolean;// "Want a gentle evening reminder?" was answered (either way)
};

// Only the fields a user (or an earlier version of the app) actually saved
export type StoredNotificationPrefs = Partial<NotificationPrefs>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  remindersOn: true,
  nudgeOn: false,
  nudgeTime: '20:30',
  softPromptDone: false,
};

// The stored settings as read: the valid fields that are present, and (P-8, docs/PACKS_REPORTS_SPEC.md section 17)
// the keys this build doesn't know, kept apart so they never reach the settings in effect, only the next save
export type StoredNotificationRecord = {stored: StoredNotificationPrefs; unknownFields?: UnknownFields};

const PREF_KEYS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_NOTIFICATION_PREFS));

// Never throws. Missing, corrupt or invalid data is "nothing stored" for that field, so the default applies to it;
// an invalid value of a known field is dropped, never carried.
export function parseStoredNotificationRecord(raw: string | null): StoredNotificationRecord {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return {stored: {}};
  }
  if (!isPlainObject(parsed)) return {stored: {}};
  const p = parsed;
  const stored: StoredNotificationPrefs = {};
  if (typeof p.remindersOn === 'boolean') stored.remindersOn = p.remindersOn;
  if (typeof p.nudgeOn === 'boolean') stored.nudgeOn = p.nudgeOn;
  if (NUDGE_TIMES.includes(p.nudgeTime as NudgeTime)) stored.nudgeTime = p.nudgeTime as NudgeTime;
  if (typeof p.softPromptDone === 'boolean') stored.softPromptDone = p.softPromptDone;
  const unknownFields = collectUnknown(p, PREF_KEYS);
  return unknownFields ? {stored, unknownFields} : {stored};
}

export function parseStoredNotificationPrefs(raw: string | null): StoredNotificationPrefs {
  return parseStoredNotificationRecord(raw).stored;
}

// The value to save: the kept keys first, then the known fields one by one (a known field always wins)
export function serialiseStoredNotificationPrefs(stored: StoredNotificationPrefs, unknownFields?: UnknownFields): string {
  const known: StoredNotificationPrefs = {};
  if (stored.remindersOn !== undefined) known.remindersOn = stored.remindersOn;
  if (stored.nudgeOn !== undefined) known.nudgeOn = stored.nudgeOn;
  if (stored.nudgeTime !== undefined) known.nudgeTime = stored.nudgeTime;
  if (stored.softPromptDone !== undefined) known.softPromptDone = stored.softPromptDone;
  return JSON.stringify(withUnknown(unknownFields, known));
}

// The settings in effect: the stored choices on top of the defaults
export function withDefaults(stored: StoredNotificationPrefs): NotificationPrefs {
  return {...DEFAULT_NOTIFICATION_PREFS, ...stored};
}

export function parseNotificationPrefs(raw: string | null): NotificationPrefs {
  return withDefaults(parseStoredNotificationPrefs(raw));
}

// Shown on a completing tick, once ever on this device: never after any answer, and not if the nudge is on already
export function shouldShowSoftPrompt(prefs: NotificationPrefs): boolean {
  return !prefs.softPromptDone && !prefs.nudgeOn;
}

// The Settings "Habit reminders" switch shows the real state: on only while the setting is on AND the phone
// allows notifications. permission is null while it is still being read; the setting shows until then.
export function reminderSwitchValue(prefs: NotificationPrefs, permission: PermissionState | null, available: boolean): boolean {
  if (!available || !prefs.remindersOn) return false;
  return permission === null || permission === 'granted';
}

// Saving a habit with a reminder time asks for permission (in context, never at launch) only while reminders
// are on and the app has never asked ('undetermined'). After any answer the phone's settings decide.
export function shouldAskOnReminderSave(prefs: NotificationPrefs, permission: PermissionState): boolean {
  return prefs.remindersOn && permission === 'undetermined';
}
