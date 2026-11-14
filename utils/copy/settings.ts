// The words on the You screen (the old Settings screen, the You tab from C2 Set 3). Moved here from app/(tabs)/you.tsx with no
// wording change (tests/copy-identical.test.ts); the three section headers are new in C2. Pure: no imports.
// Row texts that already live in another copy module stay there: SETTINGS_ROW (utils/onboarding/copy.ts),
// NAME_ROW (utils/profileName.ts), SETTINGS_PACKS_ROW (utils/packs/copy.ts), RESTORING_LINE (utils/firstPull.ts).

export const YOU_TITLE = 'You.';// was 'Settings' before the You tab (C2 Set 3)

// section headers (new in C2)
export const SECTION_REMINDERS = 'Reminders';
export const SECTION_PLAN = 'Your plan';
export const SECTION_ACCOUNT = 'Account';

export const CELEBRATIONS_ROW = 'Celebrations and messages';
export const HABIT_REMINDERS_ROW = 'Habit reminders';
export const EVENING_NUDGE_ROW = 'Evening nudge';
export const NUDGE_TIME_GROUP_LABEL = 'Evening nudge time';
export const TEST_NOTIFICATION_ROW = 'Send a test notification';
export const TEST_NOTIFICATION_HINT = 'Arrives in about 10 seconds';
export const TEST_SENT_LINE = 'Sent. It arrives in about 10 seconds. Lock your phone to see it as a lock-screen notification.';
export const TEST_FAILED_LINE = "Couldn't send the test notification.";
export const REMINDERS_UNAVAILABLE_NOTICE = "Reminders aren't available in this version of the app on this phone yet.";
export const PHONE_NOTIFICATIONS_OFF_NOTICE = 'Notifications are turned off for HabitQuest in your phone settings.';
export const OPEN_PHONE_SETTINGS_BUTTON = 'Open settings';
export const ADMIN_ROW = 'Admin';
export const SIGN_OUT_ROW = 'Sign Out';
export const SIGN_OUT_FAILED_TITLE = "Couldn't sign out";
export const SIGN_OUT_FAILED_MESSAGE = 'Please try again.';
