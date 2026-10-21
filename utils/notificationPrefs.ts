// Notification settings (per device). Pure: defaults, parsing and the soft-prompt rule; storage lives in
// services/notificationPrefs.ts. Everything is OFF until the user turns it on.

export const NUDGE_TIMES = ['19:00', '20:00', '20:30', '21:00'] as const;
export type NudgeTime = (typeof NUDGE_TIMES)[number];

export type NotificationPrefs = {
  remindersOn: boolean;// per-habit reminders at each habit's reminderTime
  nudgeOn: boolean;// one evening nudge per day
  nudgeTime: NudgeTime;
  softPromptDone: boolean;// "Want a gentle evening reminder?" was answered (either way)
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  remindersOn: false,
  nudgeOn: false,
  nudgeTime: '20:30',
  softPromptDone: false,
};

// Never throws: missing, corrupt or partly invalid data falls back to the defaults field by field
export function parseNotificationPrefs(raw: string | null): NotificationPrefs {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return {...DEFAULT_NOTIFICATION_PREFS};
  }
  if (typeof parsed !== 'object' || parsed === null) return {...DEFAULT_NOTIFICATION_PREFS};
  const p = parsed as Record<string, unknown>;
  return {
    remindersOn: p.remindersOn === true,
    nudgeOn: p.nudgeOn === true,
    nudgeTime: NUDGE_TIMES.includes(p.nudgeTime as NudgeTime) ? (p.nudgeTime as NudgeTime) : DEFAULT_NOTIFICATION_PREFS.nudgeTime,
    softPromptDone: p.softPromptDone === true,
  };
}

// Shown on a completing tick, once ever on this device: never after any answer, and not if the nudge is on already
export function shouldShowSoftPrompt(prefs: NotificationPrefs): boolean {
  return !prefs.softPromptDone && !prefs.nudgeOn;
}
