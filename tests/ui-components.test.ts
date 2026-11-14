// Stage C1: the shared components (components/ui) and the Settings pilot. A screen can't be rendered under Node's
// runner, so this checks the pure parts (utils/ui/controls.ts, constants/typography.ts) for the values Settings had
// before the migration, and reads the source for the props that must pass through, the strings, ids and labels
// that must not change, and the version-line long press that opens the trace panel.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const ui = await import('../utils/ui/controls.ts');
const typo = await import('../constants/typography.ts');
const {colors, fonts, radii, spacing} = await import('../constants/theme.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const SETTINGS = 'app/(tabs)/settings.tsx';

describe('hitSlop and the 48 dp target', () => {
  test('a control under 48 dp gets slop to 48; at 48 or more it gets none', () => {
    assert.deepEqual(ui.hitSlopFor(40), {top: 4, bottom: 4});
    assert.deepEqual(ui.hitSlopFor(34), {top: 7, bottom: 7});
    assert.equal(ui.hitSlopFor(48), undefined);
    assert.equal(ui.hitSlopFor(56), undefined);
  });

  test('the slop never passes half the gap to the next control (the Settings chips: gap 8 -> 4 per side)', () => {
    assert.deepEqual(ui.hitSlopFor(34, spacing.sm), {top: 4, bottom: 4});
    assert.deepEqual(ui.hitSlopFor(34, 0), undefined);
    assert.deepEqual(ui.hitSlopFor(34, 3), {top: 1, bottom: 1});
    assert.deepEqual(ui.hitSlopFor(40, 100), {top: 4, bottom: 4});
  });
});

describe('Button', () => {
  test('primary small is the old "Open settings" button: 40 high, 16 across, pill, accent, Space Grotesk 14 white', () => {
    const spec = ui.buttonSpec('primary', 'sm');
    assert.equal(spec.height, 40);
    assert.equal(spec.paddingHorizontal, spacing.lg);
    assert.equal(spec.borderRadius, radii.pill);
    assert.equal(spec.backgroundColor, colors.accent);
    assert.equal(spec.fontSize, 14);
    assert.equal(spec.weight, 'title');
    assert.equal(spec.textColor, 'white');
    assert.equal(spec.borderColor, undefined);
  });

  test('the four variants: primary is filled; secondary, danger are outlined; ghost has no fill or border', () => {
    assert.equal(ui.buttonSpec('secondary', 'md').borderColor, colors.accent);
    assert.equal(ui.buttonSpec('danger', 'md').borderColor, colors.error);
    assert.equal(ui.buttonSpec('danger', 'md').textColor, 'error');
    for (const v of ['secondary', 'ghost', 'danger'] as const) assert.equal(ui.buttonSpec(v, 'md').backgroundColor, 'transparent');
    assert.equal(ui.buttonSpec('ghost', 'md').borderColor, undefined);
    assert.deepEqual(['sm', 'md', 'lg'].map((s) => ui.buttonSpec('primary', s as 'sm').height), [40, 52, 56]);
  });

  test('every Button size is a step of the scale', () => {
    for (const {step} of Object.values(ui.BUTTON_SIZES)) assert.ok(step in typo.typeScale);
  });

  test('the label is always the accessible name, busy while loading, and a loading button is disabled', () => {
    assert.deepEqual(ui.buttonA11y('Open settings', undefined, false, false),
      {accessibilityRole: 'button', accessibilityLabel: 'Open settings', accessibilityState: {disabled: false, busy: false}});
    assert.deepEqual(ui.buttonA11y('Sign in', undefined, false, true).accessibilityState, {disabled: true, busy: true});
    assert.equal(ui.buttonA11y('Sign in', 'Sign in to HabitQuest', false, true).accessibilityLabel, 'Sign in to HabitQuest');
    assert.deepEqual(ui.buttonA11y('x', undefined, true, false).accessibilityState, {disabled: true, busy: false});
  });

  test('the source: testID, hint and hitSlop pass through; loading keeps the label (hidden, not removed); no animation', () => {
    const src = read('components/ui/button.tsx');
    assert.match(src, /testID=\{testID\}/);
    assert.match(src, /accessibilityHint=\{accessibilityHint\}/);
    assert.match(src, /hitSlop=\{hitSlop \?\? hitSlopFor\(spec\.height\)\}/);
    assert.match(src, /\{\.\.\.buttonA11y\(label, accessibilityLabel, disabled, loading\)\}/);
    assert.match(src, /style=\{loading \? styles\.hidden : undefined\}>\s*\{label\}/);
    assert.doesNotMatch(src, /Animated|withTiming|useSharedValue/);
  });
});

describe('Pill, Card, Screen, AppText', () => {
  test('Pill is the old time chip: 34 high, 14 across, pill-shaped; role radio and a selected state by default', () => {
    assert.deepEqual({...ui.PILL}, {height: 34, paddingHorizontal: 14, borderRadius: radii.pill});
    const src = read('components/ui/pill.tsx');
    assert.match(src, /role = 'radio'/);
    assert.match(src, /accessibilityRole=\{role\}/);
    assert.match(src, /accessibilityLabel=\{accessibilityLabel \?\? label\}/);
    assert.match(src, /accessibilityState=\{\{selected\}\}/);
    assert.match(src, /testID=\{testID\}/);
    assert.match(src, /hitSlop=\{hitSlopFor\(PILL\.height, gap\)\}/);
    assert.match(src, /selected \? 'white' : 'muted'/);
  });

  test('Card passes every View prop through and adds no role; Screen keeps the safe-area edges and the testID', () => {
    const card = read('components/ui/card.tsx');
    assert.match(card, /\{\.\.\.rest\}/);
    assert.doesNotMatch(card, /accessibilityRole|role=/);
    const screen = read('components/ui/screen.tsx');
    assert.match(screen, /edges = \['top', 'left', 'right'\]/);
    assert.match(screen, /testID=\{testID\}/);
    assert.match(screen, /backgroundColor: colors\.background/);
  });

  test('AppText passes every Text prop through (testID, accessibility, onLongPress) and sets no lineHeight', () => {
    const src = read('components/ui/app-text.tsx').replace(/\/\/.*$/gm, '');// code only
    assert.match(src, /\{\.\.\.rest\}/);
    assert.doesNotMatch(src, /lineHeight|accessibilityRole/);
  });

  test('the old Settings text styles are the same face, size and colour as the variants that replace them', () => {
    const same = (variant: Parameters<typeof typo.textStyle>[0], weight: Parameters<typeof typo.textStyle>[1], color: Parameters<typeof typo.textStyle>[2], want: [string, number, string]) => {
      const got = typo.textStyle(variant, weight, color);
      assert.deepEqual([got.fontFamily, got.fontSize, got.color], want);
    };
    same('title', undefined, 'text', [fonts.title, 26, colors.text]);             // title
    same('bodyLg', 'semiBold', 'text', [fonts.semiBold, 15, colors.text]);        // rowText
    same('bodyLg', 'semiBold', 'error', [fonts.semiBold, 15, colors.error]);      // rowText + signOutText
    same('caption', undefined, 'muted', [fonts.regular, 12, colors.muted]);       // testLine, version
    same('small', undefined, 'muted', [fonts.regular, 13, colors.muted]);         // clockLine
    same('small', 'semiBold', 'muted', [fonts.semiBold, 13, colors.muted]);       // chipText
    same('small', 'semiBold', 'white', [fonts.semiBold, 13, colors.white]);       // chipTextSelected
    same('body', undefined, 'muted', [fonts.regular, 14, colors.muted]);          // noticeText
    same('body', 'title', 'white', [fonts.title, 14, colors.white]);              // noticeButtonText
  });
});

describe('the Settings pilot', () => {
  const src = read(SETTINGS);
  const original = (name: string) => src.includes(name);

  test('it draws no Text or Pressable, sets no size or face by hand, and imports the shared components', () => {
    assert.doesNotMatch(src, /<Text[\s>]/);
    assert.doesNotMatch(src, /<Pressable[\s>]/);
    assert.doesNotMatch(src, /fontSize|fontFamily|fonts\./);
    for (const name of ['AppText', 'Button', 'Card', 'Pill', 'Row', 'Screen']) assert.match(src, new RegExp(`import \\{${name}\\} from '@/components/ui/`));
  });

  test('the version line: its long press (the way into the startup trace panel) is exactly as before', () => {
    assert.match(src, /const \[showTrace, setShowTrace\] = useState\(false\);\/\/ resets on every launch \(never saved\)/);
    assert.match(src, /const StartupTracePanel = TRACE_ON \? \(require\('@\/components\/startup-trace-panel'\) as typeof import\('@\/components\/startup-trace-panel'\)\)\.StartupTracePanel : null;/);
    assert.match(src, /<AppText\s+variant="caption"\s+color="muted"\s+style=\{styles\.version\}\s+onLongPress=\{StartupTracePanel \? \(\) => setShowTrace\(\(shown\) => !shown\) : undefined\}>\s*\{VERSION_LINE\}\s*<\/AppText>/);
    assert.match(src, /\{StartupTracePanel && showTrace && <StartupTracePanel \/>\}/);
  });

  test('the title keeps its dev-only long press, and the screen keeps its test id', () => {
    assert.match(src, /<AppText variant="title" style=\{styles\.title\} onLongPress=\{onTitleLongPress\}>\{SETTINGS_TITLE\}<\/AppText>/);
    assert.match(src, /<Screen testID=\{TEST_IDS\.settings\.screen\}/);
  });

  test('every Settings test id and accessibility label written before C1 is still there', () => {
    for (const id of ['celebrations', 'reminders', 'nudge', 'testNotification', 'openPhoneSettings', 'nameRow', 'packsRow', 'planRow', 'adminRow', 'signOut']) {
      assert.ok(original(`TEST_IDS.settings.${id}`), id);
    }
    assert.ok(original('testID={nudgeTimeId(time)}'));
    for (const label of ['accessibilityRole="radiogroup" accessibilityLabel={NUDGE_TIME_GROUP_LABEL}', 'accessibilityLabel={time}',
      'accessibilityLabel={TEST_NOTIFICATION_ROW}', 'accessibilityHint={TEST_NOTIFICATION_HINT}', 'accessibilityLiveRegion="polite"']) {
      assert.ok(original(label), label);
    }
    assert.match(src, /<Pill\s+key=\{time\}\s+label=\{time\}\s+selected=\{selected\}/);
    assert.match(src, /<Button\s+label=\{OPEN_PHONE_SETTINGS_BUTTON\}\s+size="sm"/);
    assert.match(src, /accessibilityState=\{\{disabled: !available \|\| sendingTest\}\}/);
    assert.match(src, /dimmed=\{!available\}/);
  });

  test('Sign Out is still red (icon and label, through tone="danger") and the four chevron rows keep theirs', () => {
    assert.match(src, /<Row\s+icon="logout"\s+label=\{SIGN_OUT_ROW\}\s+onPress=\{handleSignOut\}\s+tone="danger"/);
    assert.equal((src.match(/^\s+chevron$/gm) ?? []).length, 4);// name, packs, plan, admin
  });

  test('the layout numbers are the same ones: list gap 7, content bottom 18, title top 5, chips and notices', () => {
    assert.match(src, /list: \{gap: spacing\.s7\}/);
    assert.match(src, /content: \{paddingBottom: spacing\.s18\}/);
    assert.match(src, /title: \{paddingTop: spacing\.s5\}/);
    assert.match(src, /<Screen[^>]*padding=\{spacing\.lg\} gap=\{spacing\.lg\}/);
    assert.match(src, /chips: \{flexDirection: 'row', flexWrap: 'wrap', gap: spacing\.sm, paddingHorizontal: spacing\.xs\}/);
    assert.equal((src.match(/<Card gap=\{spacing\.sm\} padding=\{spacing\.lg\}>/g) ?? []).length, 3);
  });
});
