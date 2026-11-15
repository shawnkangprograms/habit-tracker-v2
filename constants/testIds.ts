// Test ids for the demo path (sign-in, Home, ticking a habit, Settings) and for every onboarding option and
// button. One place, so the screens and the end-to-end flows (Maestro, docs/TEST_STRATEGY.md) name the same things.
// Pure: no imports. Ids are lower-case kebab-case, "<screen>-<control>", and unique across this file
// (tests/test-ids.test.ts checks that, and that every id here is used by a screen and no screen writes a literal one).
//
// A dynamic id ends in a name taken from the data (a habit's name through slug(), an option's stored value):
// the same names a flow can read on the screen, never a user id or a habit id.

// "Read 10 pages!" -> "read-10-pages"; a name with no letters or digits -> "habit"
export function slug(text: string): string {
  const s = text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s === '' ? 'habit' : s;
}

export const TEST_IDS = {
  tabs: {
    today: 'tab-today',
    progress: 'tab-progress',
    you: 'tab-you',
  },
  auth: {
    screen: 'auth-screen',
    firstName: 'auth-first-name',
    lastName: 'auth-last-name',
    email: 'auth-email',
    password: 'auth-password',
    confirmPassword: 'auth-confirm-password',
    age: 'auth-age',
    submit: 'auth-submit',
    forgot: 'auth-forgot',
    switchMode: 'auth-switch-mode',
    backToSignIn: 'auth-back-to-sign-in',
  },
  home: {
    screen: 'home-screen',
    scroll: 'home-scroll',
    statsCard: 'home-stats-card',
    insightCard: 'home-insight-card',
    emptyCard: 'home-empty-card',
    emptyPick: 'home-empty-pick',
    addHabit: 'home-add-habit',
    addPack: 'home-add-pack',
    reflectionBar: 'home-reflection-bar',
  },
  settings: {
    screen: 'settings-screen',
    celebrations: 'settings-celebrations',
    reminders: 'settings-reminders',
    nudge: 'settings-nudge',
    testNotification: 'settings-test-notification',
    openPhoneSettings: 'settings-open-phone-settings',
    nameRow: 'settings-name-row',
    packsRow: 'settings-packs-row',
    planRow: 'settings-plan-row',
    adminRow: 'settings-admin-row',
    signOut: 'settings-sign-out',
  },
  onboarding: {
    screen: 'onboarding-screen',
    back: 'onboarding-back',
    skipSetup: 'onboarding-skip-setup',
    skipQuestion: 'onboarding-skip-question',
    next: 'onboarding-next',
    slider: 'onboarding-slider',
    start: 'onboarding-start',
    addOwn: 'onboarding-add-own',
    reminderSwitch: 'onboarding-reminder-switch',
    reminderTime: 'onboarding-reminder-time',
    skipDialogNo: 'onboarding-skip-dialog-no',
    skipDialogYes: 'onboarding-skip-dialog-yes',
    skipDialogGoHome: 'onboarding-skip-dialog-go-home',
  },
  icon: {
    search: 'icon-search',
  },
  awards: {
    screen: 'awards-screen',
    seeAll: 'awards-see-all',
    back: 'awards-back',
  },
} as const;

// Home: today's rows and the other-days rows, by habit name
export const habitRowId = (habitName: string) => `home-habit-row-${slug(habitName)}`;
export const habitCheckId = (habitName: string) => `home-habit-check-${slug(habitName)}`;
export const otherHabitRowId = (habitName: string) => `home-other-habit-${slug(habitName)}`;

// Settings: the evening nudge time chips ("20:30" -> settings-nudge-time-2030)
export const nudgeTimeId = (time: string) => `settings-nudge-time-${time.replace(/\D/g, '')}`;

// Onboarding: one id per option, by step key and stored value (utils/onboarding/types.ts), both in kebab-case, e.g.
// onboarding-option-sleep-struggle, onboarding-option-bad-habit-phone-social; a routine card by its pick id; a time
// chip like the nudge's
const kebab = (text: string) => text.replace(/([A-Z])/g, '-$1').replace(/_/g, '-').toLowerCase();
export const optionId = (step: string, value: string) => `onboarding-option-${kebab(step)}-${kebab(value)}`;
export const routineCardId = (pickId: string) => `onboarding-routine-card-${kebab(pickId)}`;
export const routineTimeId = (time: string) => `onboarding-reminder-time-${time.replace(/\D/g, '')}`;

// The icon picker (components/icon-picker.tsx, the habit form and the admin catalog form): a tile by its icon id and a
// group tab by its group, both kebab-case (no_sugar -> icon-no-sugar, Health -> icon-tab-health)
export const iconTileId = (iconId: string) => `icon-${kebab(iconId)}`;
export const iconTabId = (group: string) => `icon-tab-${kebab(group).replace(/^-/, '')}`;

// The awards (C4): a tile by its award id, a group header by its group (perfect_run_7 -> award-perfect-run-7,
// streaks -> awards-group-streaks)
export const awardTileId = (awardId: string) => `award-${kebab(awardId)}`;
export const awardGroupId = (group: string) => `awards-group-${kebab(group)}`;
