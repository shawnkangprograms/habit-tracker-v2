// Stage C2, Set 1 (You): the shared Row (components/ui/row.tsx), SwitchRow rebuilt on it, and Settings regrouped into
// Reminders, Your plan and Account. A screen can't be rendered under Node's runner, so SwitchRow's "looks identical" is
// pinned two ways: the resolved row style is compared with the numbers written in the OLD components/switch-row.tsx and
// in the old Settings rows (copied below, with the file they came from), and the source of the new SwitchRow is checked for
// the accessibility props, the switch's colours and the hidden inner switch it had before.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const ui = await import('../utils/ui/controls.ts');
const copy = await import('../utils/copy/settings.ts');
const {colors, fonts} = await import('../constants/theme.ts');
const typo = await import('../constants/typography.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const strip = (source: string) => source.replace(/\/\/.*$/gm, '');// code only

// BEFORE (C1 and earlier): the `row`, `rowText`, `switchBox` and `pressed` styles of components/switch-row.tsx, which
// were the same numbers as the Pressable rows in app/(tabs)/you.tsx (was settings.tsx). Written out here as plain values.
const BEFORE_ROW = {
  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8,
  borderRadius: 14, backgroundColor: '#1e1b17', borderWidth: 1, borderColor: '#332e28',
} as const;
const BEFORE_ROW_TEXT = {flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#f5f1e8'} as const;
const BEFORE_SWITCH_BOX = {width: 52, height: 32, alignItems: 'center', justifyContent: 'center'} as const;

describe('Row: the same look as the rows it replaces', () => {
  test('the resolved row style equals the old one, value for value', () => {
    assert.deepEqual({...ui.rowStyle()}, BEFORE_ROW);
  });

  test('the label is Inter semi-bold 15 in the text colour (red for the danger tone), and takes the free width', () => {
    const t = typo.textStyle('bodyLg', 'semiBold', 'text');
    assert.deepEqual({flex: 1, fontFamily: t.fontFamily, fontSize: t.fontSize, color: t.color}, BEFORE_ROW_TEXT);
    assert.equal(typo.textStyle('bodyLg', 'semiBold', 'error').color, colors.error);
    assert.equal(fonts.semiBold, 'Inter_600SemiBold');
  });

  test('the switch box, the pressed opacity (0.85), the dimmed opacity (0.5) and the icon size (22) are the old numbers', () => {
    assert.deepEqual({...ui.SWITCH_BOX}, BEFORE_SWITCH_BOX);
    assert.equal(ui.ROW.pressedOpacity, 0.85);
    assert.equal(ui.ROW.dimmedOpacity, 0.5);
    assert.equal(ui.ROW.iconSize, 22);
  });

  test('a Row is at least 48 dp tall (it is 56)', () => {
    assert.ok(ui.ROW.minHeight >= ui.MIN_TARGET);
  });

  test('the source: role defaults to button; testID, label, hint and state pass through; no label is invented; no animation', () => {
    const src = strip(read('components/ui/row.tsx'));
    assert.match(src, /accessibilityRole = 'button'/);
    assert.match(src, /accessibilityRole=\{accessibilityRole\}/);
    assert.match(src, /accessibilityLabel=\{accessibilityLabel\}/);
    assert.match(src, /accessibilityHint=\{accessibilityHint\}/);
    assert.match(src, /accessibilityState=\{accessibilityState\}/);
    assert.match(src, /testID=\{testID\}/);
    assert.match(src, /disabled=\{disabled\}/);
    assert.match(src, /pressed && !disabled && styles\.pressed/);
    assert.match(src, /danger \? colors\.error : colors\.accent/);
    assert.match(src, /chevron \? <MaterialCommunityIcons name="chevron-right" size=\{ROW\.iconSize\} color=\{colors\.muted\} \/> : null/);
    assert.doesNotMatch(src, /Animated|withTiming|useSharedValue/);
  });
});

describe('SwitchRow, rebuilt on Row, keeps what it had', () => {
  const src = strip(read('components/switch-row.tsx'));

  test('it is a Row with role switch, the label as its accessible name, and checked/disabled state', () => {
    assert.match(src, /<Row\s/);
    assert.doesNotMatch(src, /<Pressable|<Text[\s>]|rowText|\brow:|styles\.row\b/);// no row style of its own
    assert.match(src, /onPress=\{\(\) => onChange\(!value\)\}/);
    assert.match(src, /disabled=\{disabled\}/);
    assert.match(src, /accessibilityRole="switch"/);
    assert.match(src, /accessibilityLabel=\{label\}/);
    assert.match(src, /accessibilityState=\{\{checked: value, disabled: !!disabled\}\}/);
    assert.match(src, /testID=\{testID\}/);
  });

  test('the inner switch is the same: hidden from screen readers, in the fixed box, with the same colours', () => {
    assert.match(src, /<View style=\{styles\.switchBox\} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>/);
    assert.match(src, /switchBox: SWITCH_BOX/);
    assert.match(src, /trackColor=\{\{false: colors\.border, true: colors\.accent\}\}/);
    assert.match(src, /thumbColor=\{colors\.white\}/);
    assert.match(src, /ios_backgroundColor=\{colors\.border\}/);
    assert.match(src, /value=\{value\}\s+onValueChange=\{onChange\}\s+disabled=\{disabled\}/);
  });

  test('its five callers pass the same props as before (the habit form, the onboarding reminder, Admin stats, Settings)', () => {
    assert.match(read('app/habit-form.tsx'), /<SwitchRow icon="clock-outline" label="Reminder time" value=\{reminderOn\} onChange=\{toggleReminder\} \/>/);
    assert.match(read('app/habit-form.tsx'), /<SwitchRow icon="bell-ring-outline" label="Alarm sound" value=\{alarm\} onChange=\{setAlarm\} \/>/);
    assert.match(read('components/onboarding/routine-reminder.tsx'), /<SwitchRow icon="clock-outline" label=\{ROUTINE_REMINDER_LABEL\} value=\{on\} onChange=\{onToggle\} disabled=\{disabled\} testID=\{TEST_IDS\.onboarding\.reminderSwitch\} \/>/);
    assert.match(read('app/admin/stats.tsx'), /<SwitchRow icon="flask-outline" label="Include test accounts" value=\{includeTest\} onChange=\{setIncludeTest\} \/>/);
  });
});

describe('Settings: three sections', () => {
  const src = read('app/(tabs)/you.tsx');
  const section = (name: string) => {
    const start = src.indexOf(`<Section title={${name}}>`);
    assert.ok(start >= 0, name);
    return src.slice(start, src.indexOf('</Section>', start));
  };
  const ids = (block: string) => [...block.matchAll(/TEST_IDS\.settings\.(\w+)/g)].map((m) => m[1]);

  test('the headers are Reminders, Your plan and Account, in that order, each a header for screen readers', () => {
    assert.deepEqual([copy.SECTION_REMINDERS, copy.SECTION_PLAN, copy.SECTION_ACCOUNT], ['Reminders', 'Your plan', 'Account']);
    const order = ['SECTION_REMINDERS', 'SECTION_PLAN', 'SECTION_ACCOUNT'].map((n) => src.indexOf(`<Section title={${n}}>`));
    assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], order.join());
    assert.match(src, /<AppText variant="label" color="muted" accessibilityRole="header">\{title\}<\/AppText>/);
  });

  test('Reminders: celebrations, habit reminders, evening nudge and its chips, then the test notification', () => {
    assert.deepEqual(ids(section('SECTION_REMINDERS')), ['celebrations', 'reminders', 'nudge', 'testNotification', 'openPhoneSettings']);
    assert.match(section('SECTION_REMINDERS'), /nudgeTimeId\(time\)/);
  });

  test('Your plan: Your name, Habit packs, Set up your plan (with its "still being restored" notice under it)', () => {
    const block = section('SECTION_PLAN');
    assert.deepEqual(ids(block), ['nameRow', 'packsRow', 'planRow']);
    assert.ok(block.indexOf('planNotice') > block.indexOf('TEST_IDS.settings.planRow'));
    assert.match(block, /\{planNotice \? \(\s*<Card gap=\{spacing\.sm\} padding=\{spacing\.lg\}>\s*<AppText variant="body" color="muted" accessibilityLiveRegion="polite">\{planNotice\}<\/AppText>\s*<\/Card>\s*\) : null\}/);
  });

  test('Account: Admin only for admins, then Sign Out, last, red', () => {
    const block = section('SECTION_ACCOUNT');
    assert.deepEqual(ids(block), ['adminRow', 'signOut']);
    assert.match(block, /\{isAdmin && \(\s*<Row[\s\S]*?TEST_IDS\.settings\.adminRow/);
    assert.match(block, /tone="danger"/);
    assert.ok(src.indexOf('TEST_IDS.settings.signOut') > src.indexOf('TEST_IDS.settings.planRow'));
    assert.equal(src.slice(src.indexOf('TEST_IDS.settings.signOut')).includes('<Row'), false, 'Sign Out is the last row');
  });

  test('the sync lines stay directly under the title; the version line stays below the last section', () => {
    assert.ok(src.indexOf('syncMessages.map') > src.indexOf('{YOU_TITLE}'));
    assert.ok(src.indexOf('syncMessages.map') < src.indexOf('<Section title={SECTION_REMINDERS}>'));
    assert.ok(src.lastIndexOf('{VERSION_LINE}') > src.lastIndexOf('</Section>'));
  });

  test('room, but no rows, for Privacy, Feedback and Delete account', () => {
    assert.doesNotMatch(src + read('utils/copy/settings.ts'), /Privacy|Feedback|Delete account/i);
  });

  test('every row is a Row or a SwitchRow (no hand-made row), and each Row has a test id', () => {
    assert.doesNotMatch(src, /<Pressable/);
    for (const tag of src.match(/<Row\s[\s\S]*?\/>/g) ?? []) assert.match(tag, /testID=\{TEST_IDS\.settings\./);
  });
});

describe('the Settings words moved to utils/copy/settings.ts, unchanged', () => {
  test('each moved text is the one the screen had before', () => {
    assert.deepEqual(
      [copy.YOU_TITLE, copy.CELEBRATIONS_ROW, copy.HABIT_REMINDERS_ROW, copy.EVENING_NUDGE_ROW, copy.NUDGE_TIME_GROUP_LABEL,
        copy.TEST_NOTIFICATION_ROW, copy.TEST_NOTIFICATION_HINT, copy.OPEN_PHONE_SETTINGS_BUTTON, copy.ADMIN_ROW, copy.SIGN_OUT_ROW,
        copy.SIGN_OUT_FAILED_TITLE, copy.SIGN_OUT_FAILED_MESSAGE],
      ['You.', 'Celebrations and messages', 'Habit reminders', 'Evening nudge', 'Evening nudge time',
        'Send a test notification', 'Arrives in about 10 seconds', 'Open settings', 'Admin', 'Sign Out',
        "Couldn't sign out", 'Please try again.'],
    );
    assert.equal(copy.TEST_SENT_LINE, 'Sent. It arrives in about 10 seconds. Lock your phone to see it as a lock-screen notification.');
    assert.equal(copy.TEST_FAILED_LINE, "Couldn't send the test notification.");
    assert.equal(copy.REMINDERS_UNAVAILABLE_NOTICE, "Reminders aren't available in this version of the app on this phone yet.");
    assert.equal(copy.PHONE_NOTIFICATIONS_OFF_NOTICE, 'Notifications are turned off for HabitQuest in your phone settings.');
  });

  test('the copy module is pure (no imports)', () => {
    assert.doesNotMatch(read('utils/copy/settings.ts'), /^import /m);
  });
});
