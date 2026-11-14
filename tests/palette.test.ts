// C1b: palette B (docs/HABITQUEST_DESIGN.md). Pins the token values, and computes the contrast of every
// foreground/background pair the code really draws. Each pair names where it is drawn, and the test checks that source,
// so a pair can't stay in this table after the code stops drawing it. Text needs 4.5:1; a field's border, a mark and an
// icon need 3:1. Pairs under 3:1 that carry no information (card edges, tracks, the first heat-strip step) are listed
// by name in KNOWN_DECORATIVE: a new low pair has to be added there on purpose. Colours with transparency (pressed
// opacity, tints) are blended over the colour behind them before the ratio is taken (WCAG 2.x relative luminance).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const {colors, medalTiers, pressedOpacity, ICON_GROUP_COLORS} = await import('../constants/theme.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// `fg` at opacity `alpha` over `bg`
export const over = (fg: string, alpha: number, bg: string) => toHex(rgb(fg).map((v, i) => v * alpha + rgb(bg)[i] * (1 - alpha)));
const tint = (suffix: string) => parseInt(suffix, 16) / 255;// the alpha a two-digit suffix (colors.x + '26') stands for

type Pair = {name: string; fg: string; bg: string; min: 4.5 | 3; drawnBy: [string, RegExp][]};

const TEXT = 4.5;
const UI = 3;
const accentPressed = (behind: string) => over(colors.accent, pressedOpacity.accent, behind);

const PAIRS: Pair[] = [
  // text on the page, the cards and the floating cards
  {name: 'text on background', fg: colors.text, bg: colors.background, min: TEXT, drawnBy: [['app/(tabs)/progress.tsx', /color: colors\.text/]]},
  {name: 'text on surface', fg: colors.text, bg: colors.surface, min: TEXT, drawnBy: [['components/ui/row.tsx', /color=\{danger \? 'error' : 'text'\}/]]},
  {name: 'text on raised', fg: colors.text, bg: colors.raised, min: TEXT, drawnBy: [['components/encouragement-toast.tsx', /color: colors\.text/], ['components/encouragement-toast.tsx', /backgroundColor: colors\.raised/]]},
  {name: 'muted on background', fg: colors.muted, bg: colors.background, min: TEXT, drawnBy: [['app/(tabs)/you.tsx', /variant="caption"\s+color="muted"\s+style=\{styles\.version\}/]]},
  {name: 'muted on surface', fg: colors.muted, bg: colors.surface, min: TEXT, drawnBy: [['components/ui/card.tsx', /backgroundColor: colors\.surface/], ['app/(tabs)/you.tsx', /<Card gap=\{spacing\.sm\} padding=\{spacing\.lg\}>\s*<AppText variant="body" color="muted"/]]},
  {name: 'muted on raised', fg: colors.muted, bg: colors.raised, min: TEXT, drawnBy: [['components/celebration-overlay.tsx', /body: \{[^}]*color: colors\.muted/], ['components/celebration-overlay.tsx', /backgroundColor: colors\.raised/]]},
  {name: 'muted placeholder on the input fill', fg: colors.muted, bg: colors.inputFill, min: TEXT, drawnBy: [['app/auth.tsx', /placeholderTextColor=\{colors\.muted\}/]]},
  {name: 'accent text on background', fg: colors.accent, bg: colors.background, min: TEXT, drawnBy: [['app/(tabs)/index.tsx', /addText: \{[^}]*color: colors\.accent/]]},
  {name: 'accent text on surface', fg: colors.accent, bg: colors.surface, min: TEXT, drawnBy: [['components/packs/pack-card.tsx', /addText: \{[^}]*color: colors\.accent/]]},
  {name: 'accent text on raised', fg: colors.accent, bg: colors.raised, min: TEXT, drawnBy: [['components/reflections/reflection-bar.tsx', /button: \{[^}]*color: colors\.accent/], ['components/onboarding/skip-dialog.tsx', /secondaryText: \{[^}]*color: colors\.accent/]]},
  {name: 'error text on background', fg: colors.error, bg: colors.background, min: TEXT, drawnBy: [['app/habit-form.tsx', /errorText: \{[^}]*color: colors\.error/]]},
  {name: 'error text on surface (Sign Out)', fg: colors.error, bg: colors.surface, min: TEXT, drawnBy: [['app/(tabs)/you.tsx', /tone="danger"/]]},
  {name: 'error text on its 8% tint (delete buttons)', fg: colors.error, bg: over(colors.error, tint('14'), colors.background), min: TEXT, drawnBy: [['app/habit-form.tsx', /backgroundColor: colors\.error \+ '14'/]]},
  // the orange fill and what sits on it
  {name: 'onAccent label on accent (Button, Pill)', fg: colors.onAccent, bg: colors.accent, min: TEXT, drawnBy: [['utils/ui/controls.ts', /textColor: 'onAccent'/], ['components/ui/pill.tsx', /selected \? 'onAccent'/]]},
  {name: 'onAccent label on accent pressed (0.9) over background', fg: colors.onAccent, bg: accentPressed(colors.background), min: TEXT, drawnBy: [['utils/ui/controls.ts', /variant === 'primary' \? pressedOpacity\.accent/]]},
  {name: 'onAccent label on accent pressed (0.9) over surface', fg: colors.onAccent, bg: accentPressed(colors.surface), min: TEXT, drawnBy: [['components/packs/choose-packs-card.tsx', /pressedAccent: \{opacity: pressedOpacity\.accent\}/]]},
  {name: 'onAccent label on accent pressed (0.9) over raised', fg: colors.onAccent, bg: accentPressed(colors.raised), min: TEXT, drawnBy: [['components/celebration-overlay.tsx', /pressedAccent: \{opacity: pressedOpacity\.accent\}/]]},
  {name: 'onAccent ink on the selected Week/Month segment', fg: colors.onAccent, bg: colors.accent, min: TEXT, drawnBy: [['components/summary-range-toggle.tsx', /selectedLabel: \{color: colors\.onAccent\}/]]},
  {name: 'onAccent label on the hand-built accent buttons (Save, Sign in, Continue)', fg: colors.onAccent, bg: colors.accent, min: TEXT, drawnBy: [['app/auth.tsx', /primaryText: \{[^}]*color: colors\.onAccent/], ['app/onboarding.tsx', /primaryText: \{[^}]*color: colors\.onAccent/], ['components/celebration-overlay.tsx', /buttonText: \{[^}]*color: colors\.onAccent/]]},
  {name: 'onAccent label on a selected chip', fg: colors.onAccent, bg: colors.accent, min: TEXT, drawnBy: [['app/habit-form.tsx', /onAccentText: \{color: colors\.onAccent\}/], ['app/habit-form.tsx', /pillSelected: \{backgroundColor: colors\.accent\}/]]},
  {name: 'success text on background (on time, saved, confirm)', fg: colors.success, bg: colors.background, min: TEXT, drawnBy: [['app/profile-name.tsx', /saved: \{[^}]*color: colors\.success/], ['app/auth.tsx', /confirmText: \{[^}]*color: colors\.success/]]},
  {name: 'success text on a habit row (on time)', fg: colors.success, bg: colors.surface, min: TEXT, drawnBy: [['app/(tabs)/index.tsx', /onTime: \{[^}]*color: colors\.success\}/]]},
  {name: 'success "Added" on an onboarding routine card', fg: colors.success, bg: colors.surface, min: TEXT, drawnBy: [['components/onboarding/routine-card.tsx', /added: \{[^}]*color: colors\.success\}/]]},
  {name: 'text on the reflection reward tint over raised', fg: colors.text, bg: over(colors.accent, tint('26'), colors.raised), min: TEXT, drawnBy: [['components/reflections/reflection-bar.tsx', /rewardText: \{[^}]*color: colors\.text/], ['components/reflections/reflection-bar.tsx', /backgroundColor: `\$\{colors\.accent\}26`/]]},
  // the tab bar
  {name: 'tab label, inactive (muted on surface)', fg: colors.muted, bg: colors.surface, min: TEXT, drawnBy: [['app/(tabs)/_layout.tsx', /tabBarInactiveTintColor: colors\.muted/]]},
  {name: 'tab label, active (accent on surface)', fg: colors.accent, bg: colors.surface, min: TEXT, drawnBy: [['app/(tabs)/_layout.tsx', /tabBarActiveTintColor: colors\.accent/]]},
  {name: 'streak tab number on the inactive (muted) pill', fg: colors.onAccent, bg: colors.muted, min: TEXT, drawnBy: [['components/streak-tab-icon.tsx', /color: colors\.onAccent/]]},
  {name: 'streak tab number on the active (accent) pill', fg: colors.onAccent, bg: colors.accent, min: TEXT, drawnBy: [['components/streak-tab-icon.tsx', /backgroundColor: color\}/]]},
  {name: 'locked medal number (muted on the locked metal)', fg: colors.muted, bg: medalTiers.locked.base, min: TEXT, drawnBy: [['components/medal.tsx', /let numberColor: string = colors\.muted;/]]},
  // borders, marks and icons
  {name: 'input border on the input fill', fg: colors.inputBorder, bg: colors.inputFill, min: UI, drawnBy: [['app/auth.tsx', /borderColor: colors\.inputBorder/], ['components/time-field.tsx', /borderColor: colors\.inputBorder/]]},
  {name: 'input border on surface', fg: colors.inputBorder, bg: colors.surface, min: UI, drawnBy: [['components/habit-fields.tsx', /borderColor: colors\.inputBorder/]]},
  {name: 'habit check: the onAccent mark on success (D3)', fg: colors.onAccent, bg: colors.success, min: UI, drawnBy: [['components/habit-check.tsx', /name="check" size=\{17\} color=\{colors\.onAccent\}/], ['components/habit-check.tsx', /checkDone: \{backgroundColor: colors\.success, borderColor: colors\.success\}/]]},
  {name: 'habit check: the success fill on a habit row', fg: colors.success, bg: colors.surface, min: UI, drawnBy: [['components/habit-check.tsx', /backgroundColor: colors\.success/]]},
  {name: 'onboarding check and radio dot: onAccent on the accent (D4)', fg: colors.onAccent, bg: colors.accent, min: UI, drawnBy: [['components/onboarding/option-button.tsx', /name="check" size=\{15\} color=\{colors\.onAccent\}/], ['components/onboarding/option-button.tsx', /dot: \{[^}]*backgroundColor: colors\.onAccent\}/], ['components/onboarding/routine-card.tsx', /name="check" size=\{15\} color=\{colors\.onAccent\}/]]},
  {name: 'perfect-day star (success) on its raised banner', fg: colors.success, bg: colors.raised, min: UI, drawnBy: [['components/perfect-day-banner.tsx', /name="star-four-points" size=\{18\} color=\{colors\.success\}/]]},
  {name: 'done-today ring and vitality bar (success) on the stats card', fg: colors.success, bg: colors.surface, min: UI, drawnBy: [['components/stats-card.tsx', /restDay \? colors\.muted : colors\.success/], ['components/vitality-bar.tsx', /backgroundColor: colors\.success/]]},
  {name: 'enabled-user status icon (success) on the admin card', fg: colors.success, bg: colors.surface, min: UI, drawnBy: [['app/admin/user.tsx', /load\.user\.disabled \? colors\.error : colors\.success/]]},
  {name: 'switch thumb (white) on the accent track', fg: colors.white, bg: colors.accent, min: UI, drawnBy: [['components/switch-row.tsx', /thumbColor=\{colors\.white\}/]]},
  {name: 'switch thumb (white) on the off track', fg: colors.white, bg: colors.border, min: UI, drawnBy: [['components/switch-row.tsx', /trackColor=\{\{false: colors\.border/]]},
  {name: 'accent icons on surface (rows)', fg: colors.accent, bg: colors.surface, min: UI, drawnBy: [['components/ui/row.tsx', /danger \? colors\.error : colors\.accent/]]},
  {name: 'muted chevron on surface', fg: colors.muted, bg: colors.surface, min: UI, drawnBy: [['components/ui/row.tsx', /name="chevron-right" size=\{ROW\.iconSize\} color=\{colors\.muted\}/]]},
  {name: 'pink habit icon on surface', fg: colors.pink, bg: colors.surface, min: UI, drawnBy: [['constants/theme.ts', /water: colors\.pink/]]},
  {name: 'green habit icon on surface', fg: colors.green, bg: colors.surface, min: UI, drawnBy: [['constants/theme.ts', /run: colors\.green/]]},
  {name: 'blue habit icon on surface', fg: colors.blue, bg: colors.surface, min: UI, drawnBy: [['constants/theme.ts', /study: colors\.blue/]]},
  {name: 'amber habit icon on surface', fg: colors.amber, bg: colors.surface, min: UI, drawnBy: [['constants/theme.ts', /book: colors\.amber/]]},
  {name: 'purple habit icon on surface', fg: colors.purple, bg: colors.surface, min: UI, drawnBy: [['constants/theme.ts', /meditate: colors\.purple/]]},
];

// Under 3:1 on purpose: they carry no information on their own (an edge, a track, a faint first step whose meaning is
// in its label and the dashed "nothing scheduled" outline), or they are on a later list (the blaze medal: C4 redraws
// the medals). A new pair under the line has to be added here by name.
const KNOWN_DECORATIVE: Pair[] = [
  {name: 'card border on surface', fg: colors.border, bg: colors.surface, min: UI, drawnBy: [['components/ui/card.tsx', /borderColor: colors\.border/]]},
  {name: 'card border on raised', fg: colors.border, bg: colors.raised, min: UI, drawnBy: [['components/onboarding/skip-dialog.tsx', /borderColor: colors\.border/]]},
  {name: 'surface against background (a card\'s edge)', fg: colors.surface, bg: colors.background, min: UI, drawnBy: [['components/ui/card.tsx', /backgroundColor: colors\.surface/]]},
  {name: 'raised against background (a floating card\'s edge)', fg: colors.raised, bg: colors.background, min: UI, drawnBy: [['components/encouragement-toast.tsx', /backgroundColor: colors\.raised/]]},
  {name: 'progress track on surface', fg: colors.track, bg: colors.surface, min: UI, drawnBy: [['components/stats-card.tsx', /colors\.track/]]},
  {name: 'heat strip step 1 (accent 45%) on its card', fg: over(colors.accent, tint('73'), colors.surface), bg: colors.surface, min: UI, drawnBy: [['components/summary-scale.ts', /1: colors\.accent \+ '73'/]]},
  {name: 'blaze medal number (white on accent): C4 redraws the medals', fg: colors.white, bg: medalTiers.blaze.base, min: TEXT, drawnBy: [['components/medal.tsx', /DARK_TEXT_TIERS\.includes\(tier\) \? metal\.dark : colors\.white/]]},
];

describe('palette B: the token values', () => {
  test('the new and changed tokens are the approved ones; the base and the orange stay', () => {
    assert.deepEqual(
      {background: colors.background, surface: colors.surface, raised: colors.raised, inputBorder: colors.inputBorder, muted: colors.muted,
        accent: colors.accent, onAccent: colors.onAccent, success: colors.success, error: colors.error, green: colors.green, pink: colors.pink,
        border: colors.border, text: colors.text},
      {background: '#1a1815', surface: '#221f1a', raised: '#2a2620', inputBorder: '#756a5c', muted: '#b0a99b',
        accent: '#f2691b', onAccent: '#1a1815', success: '#2bb584', error: '#ff7a7a', green: '#1d9e75', pink: '#e0658f',
        border: '#332e28', text: '#f5f1e8'},
    );
    assert.equal(colors.scrim, 'rgba(0, 0, 0, 0.6)');
    assert.equal(colors.scrimStrong, 'rgba(10, 9, 8, 0.82)');
    assert.deepEqual({...pressedOpacity}, {default: 0.85, accent: 0.9});
  });

  test('every colour token is #rrggbb, so a two-digit alpha suffix stays valid; only the two scrims are rgba() and never get one', () => {
    for (const [key, value] of Object.entries(colors)) {
      if (key === 'scrim' || key === 'scrimStrong') continue;
      assert.match(value, /^#[0-9a-f]{6}$/, key);
    }
    // a suffix on a scrim would make an invalid colour
    for (const file of ['app', 'components', 'hooks', 'utils'].flatMap(sourceFiles)) {
      assert.doesNotMatch(read(file), /colors\.scrim(Strong)?\s*\+|\$\{colors\.scrim(Strong)?\}[0-9a-fA-F]/, file);
    }
  });
});

describe('palette B: every pair the code draws', () => {
  test('each pair is really drawn: its source still says so', () => {
    for (const pair of [...PAIRS, ...KNOWN_DECORATIVE]) {
      for (const [file, pattern] of pair.drawnBy) assert.match(read(file), pattern, `${pair.name}: ${file}`);
    }
  });

  test('text pairs reach 4.5:1 and borders, marks and icons 3:1', () => {
    const low = PAIRS.filter((p) => contrast(p.fg, p.bg) < p.min).map((p) => `${p.name}: ${contrast(p.fg, p.bg).toFixed(2)} < ${p.min}`);
    assert.deepEqual(low, []);
  });

  test('the known decorative pairs are the only ones under the line, and they are still under it (else move them up)', () => {
    for (const pair of KNOWN_DECORATIVE) assert.ok(contrast(pair.fg, pair.bg) < pair.min, `${pair.name} now passes: move it to PAIRS`);
  });

  test('the ratios the decisions were made on', () => {
    const r = (fg: string, bg: string) => Number(contrast(fg, bg).toFixed(2));
    assert.equal(r(colors.onAccent, colors.accent), 5.75);
    assert.equal(r(colors.white, colors.accent), 3.08);// why the label went dark
    assert.equal(r(colors.onAccent, over(colors.accent, 0.85, colors.background)), 4.49);// why pressed is 0.9 on the accent
    assert.equal(r(colors.onAccent, accentPressed(colors.background)), 4.87);
    assert.equal(r(colors.white, colors.success), 2.61);// why the habit check goes dark on success (C1b Set 2)
    assert.equal(r(colors.onAccent, colors.success), 6.79);
    assert.equal(r(colors.inputBorder, colors.inputFill), 3.35);
    assert.equal(r(colors.accent, over(colors.accent, tint('26'), colors.raised)), 3.96);// why the reward amount is in text ink
  });
});

describe('the surface ladder, the input borders and the pressed opacity (C1b Set 1)', () => {
  const APP = ['app', 'components'].flatMap(sourceFiles);

  test('raised is used by exactly the dialogs and floating cards (D2); everything else stays on surface', () => {
    const raised = APP.filter((f) => /colors\.raised/.test(read(f))).sort();
    assert.deepEqual(raised, [
      'components/celebration-overlay.tsx', 'components/encouragement-toast.tsx', 'components/onboarding/skip-dialog.tsx',
      'components/perfect-day-banner.tsx', 'components/reflections/reflection-bar.tsx',
    ]);
  });

  test('inputBorder is on the text fields and the time field only (D7), and no field keeps the card border', () => {
    const users = APP.filter((f) => /colors\.inputBorder/.test(read(f))).sort();
    assert.deepEqual(users, [
      'app/admin/users.tsx', 'app/auth.tsx', 'app/habit-form.tsx', 'app/packs/edit.tsx', 'app/profile-name.tsx',
      'app/profile-setup.tsx', 'app/reflect.tsx', 'components/habit-fields.tsx', 'components/icon-picker.tsx', 'components/time-field.tsx',// the picker's search field (C3)
    ]);
    for (const file of users) {
      for (const block of read(file).match(/\{[^{}]*backgroundColor: colors\.inputFill[^{}]*\}/g) ?? []) {
        assert.match(block, /borderColor: colors\.inputBorder/, file);
      }
    }
  });

  // The style names a file fills with the accent (not a tint: colors.accent with no suffix)
  const accentFilled = (source: string) => [...source.matchAll(/^\s+(\w+): \{([^{}]*)\}/gm)]
    .filter((m) => /backgroundColor: colors\.accent(,|\s*\}|$)/m.test(m[2] + '}'))
    .map((m) => m[1]);
  // The style arrays of pressables: style={({pressed}) => [ ... ]}
  const pressedArrays = (source: string) => [...source.matchAll(/style=\{\(\{pressed\}\) => \[([\s\S]*?)\]\}/g)].map((m) => m[1]);
  // A selected accent segment is never pressed-styled (pressed && !selected): nothing to choose there
  const NEVER_PRESSED_WHEN_FILLED = /pressed && !selected/;
  // The trace panel's Clear button reuses the accent button's shape and then sets its own background (styles.secondary)
  const FILL_OVERRIDDEN = /styles\.button, styles\.secondary,/;

  test('every hand-built control filled with the accent presses to 0.9 (styles.pressedAccent); nothing else does', () => {
    const sites: string[] = [];
    for (const file of APP) {
      const source = read(file);
      const filled = accentFilled(source);
      for (const arr of pressedArrays(source)) {
        const fillsAccent = filled.some((name) => new RegExp(`styles\\.${name}\\b`).test(arr));
        if (fillsAccent && !NEVER_PRESSED_WHEN_FILLED.test(arr) && !FILL_OVERRIDDEN.test(arr)) {
          assert.match(arr, /styles\.pressedAccent/, `${file}: ${arr.trim().slice(0, 80)}`);
          sites.push(file);
        } else {
          assert.doesNotMatch(arr, /styles\.pressedAccent/, `${file}: ${arr.trim().slice(0, 80)}`);
        }
      }
      if (/pressedAccent: \{/.test(source)) assert.match(source, /pressedAccent: \{opacity: pressedOpacity\.accent\}/, file);
    }
    assert.deepEqual(sites.sort(), [
      'app/admin/catalog-form.tsx', 'app/admin/stats.tsx', 'app/admin/user.tsx', 'app/auth.tsx', 'app/habit-form.tsx',
      'app/packs/choose.tsx', 'app/packs/edit.tsx', 'app/profile-name.tsx', 'app/profile-setup.tsx', 'app/reflect.tsx',
      'components/admin-status.tsx', 'components/celebration-overlay.tsx',
      'components/empty-home-card.tsx', 'components/onboarding/skip-dialog.tsx', 'components/packs/choose-packs-card.tsx',
      'components/reminder-prompt.tsx', 'components/startup-trace-panel.tsx', 'components/summary-empty-card.tsx',
    ]);
  });

  test('where one pressable is filled or not by a condition, only the filled case presses to 0.9', () => {
    assert.match(read('components/onboarding/skip-dialog.tsx'),
      /\[primary \? styles\.primary : styles\.secondary, pressed && \(primary \? styles\.pressedAccent : styles\.pressed\)\]/);
    assert.match(read('app/admin/user.tsx'),
      /load\.user\.disabled \? styles\.primaryButton : styles\.dangerButton,\s*\(pressed \|\| saving\) && \(load\.user\.disabled \? styles\.pressedAccent : styles\.pressed\),/);
  });

  test('where a file has an accent control, both of its pressed opacities come from pressedOpacity (no 0.85 or 0.9 written)', () => {
    for (const file of APP.filter((f) => /pressedAccent: \{/.test(read(f)))) {
      assert.doesNotMatch(read(file), /pressed\w*: \{opacity: 0\.(85|9)\}/, file);
    }
  });
});

// White is used only where it is not on the accent: the switch thumb (D4), the confidence slider's thumb and the medal
// numbers (the blaze medal's, white on the accent, is on the C4 list). C1b Set 2 moved every label and mark on an accent
// fill to onAccent, and the Set 2 list that tracked the files still to do is empty and gone.
const WHITE_KEPT = ['components/medal.tsx', 'components/onboarding/confidence-slider.tsx', 'components/switch-row.tsx'];

describe('white: only the three places it is kept', () => {
  test('colors.white is used by the switch row, the confidence slider and the medal, and nowhere else', () => {
    const users = ['app', 'components', 'hooks', 'services', 'utils'].flatMap(sourceFiles).filter((f) => /colors\.white/.test(read(f))).sort();
    assert.deepEqual(users, WHITE_KEPT);
    assert.match(read('components/switch-row.tsx'), /thumbColor=\{colors\.white\}/);
    assert.match(read('components/onboarding/confidence-slider.tsx'), /backgroundColor: colors\.white,/);
    assert.match(read('components/medal.tsx'), /\? metal\.dark : colors\.white;/);
    for (const file of WHITE_KEPT) assert.equal((read(file).match(/colors\.white/g) ?? []).length, 1, file);
  });

  test('the shared Button and Pill draw no white', () => {
    for (const file of ['components/ui/button.tsx', 'components/ui/pill.tsx', 'utils/ui/controls.ts']) {
      assert.doesNotMatch(read(file), /colors\.white|'white'/, file);
    }
  });
});

describe('status colours (D1): success for status, green kept for categories', () => {
  test('the status uses draw success; none of them draws green', () => {
    const status: [string, RegExp][] = [
      ['components/habit-check.tsx', /checkDone: \{backgroundColor: colors\.success, borderColor: colors\.success\}/],
      ['app/(tabs)/index.tsx', /name="check" size=\{11\} color=\{colors\.success\}/],
      ['app/(tabs)/index.tsx', /onTime: \{fontFamily: fonts\.semiBold, color: colors\.success\}/],
      ['app/profile-name.tsx', /saved: \{[^}]*color: colors\.success/],
      ['app/auth.tsx', /confirmText: \{[^}]*color: colors\.success/],
      ['components/perfect-day-banner.tsx', /color=\{colors\.success\}/],
      ['components/perfect-day-banner.tsx', /borderColor: colors\.success \+ '80'/],
      ['components/vitality-bar.tsx', /backgroundColor: colors\.success/],
      ['components/stats-card.tsx', /restDay \? colors\.muted : colors\.success/],
      ['components/onboarding/routine-card.tsx', /added: \{[^}]*color: colors\.success\}/],
      ['app/admin/user.tsx', /colors\.error : colors\.success/],
    ];
    for (const [file, pattern] of status) assert.match(read(file), pattern, file);
    for (const file of ['components/habit-check.tsx', 'app/profile-name.tsx', 'app/auth.tsx', 'components/perfect-day-banner.tsx',
      'components/vitality-bar.tsx', 'components/stats-card.tsx', 'components/onboarding/routine-card.tsx', 'app/admin/user.tsx', 'app/(tabs)/index.tsx']) {
      assert.doesNotMatch(read(file), /colors\.green/, file);
    }
  });

  test('green is left to the category uses: the habit icons and the admin charts', () => {
    const users = ['app', 'components', 'hooks', 'services', 'utils', 'constants'].flatMap(sourceFiles)
      .filter((f) => /colors\.green/.test(read(f))).sort();
    assert.deepEqual(users, ['app/admin/stats.tsx', 'constants/theme.ts']);
    assert.match(read('constants/theme.ts'), /run: colors\.green,/);
    // the admin charts' series and area colours are categories: green, never the status success
    const stats = read('app/admin/stats.tsx');
    assert.match(stats, /Health: colors\.green,/);
    assert.match(stats, /label: 'Completion', values: view\.completionPercent, color: colors\.green/);
    assert.doesNotMatch(stats, /colors\.success/);
  });
});

describe('the scrims and the Sign in button', () => {
  test('the two backdrops use the scrim tokens', () => {
    assert.match(read('components/celebration-overlay.tsx'), /backdrop: \{flex: 1, backgroundColor: colors\.scrimStrong\}/);
    assert.match(read('components/onboarding/skip-dialog.tsx'), /backgroundColor: colors\.scrim\}/);
  });

  test('Sign in: disabled has its own look (0.5, like the Save buttons); pressed stays 0.9', () => {
    const auth = read('app/auth.tsx');
    assert.match(auth, /\[styles\.primaryButton, buttonDisabled \? styles\.primaryOff : pressed && styles\.pressedAccent\]/);
    assert.match(auth, /primaryOff: \{opacity: 0\.5\}/);
    assert.match(auth, /pressedAccent: \{opacity: pressedOpacity\.accent\}/);
    assert.match(auth, /disabled=\{buttonDisabled\}/);
    // the five Save buttons have the same two looks
    for (const file of ['app/packs/choose.tsx', 'app/packs/edit.tsx', 'app/profile-name.tsx', 'app/profile-setup.tsx', 'app/reflect.tsx']) {
      assert.match(read(file), /!canSave \? styles\.saveOff : pressed && styles\.pressedAccent/, file);
      assert.match(read(file), /saveOff: \{opacity: 0\.5\}/, file);
    }
  });

  test('ThemedText has no link style any more (the template\'s #0a7ea4)', () => {
    const src = read('components/themed-text.tsx');
    assert.doesNotMatch(src, /link/);
    assert.match(src, /type\?: 'default' \| 'title' \| 'defaultSemiBold' \| 'subtitle';/);
  });
});

describe('the icon group colours (C3, D4)', () => {
  test('every group colour reaches 3:1 as an icon on the surface (habit rows, the picker) and on the page', () => {
    for (const [group, colour] of Object.entries(ICON_GROUP_COLORS)) {
      assert.ok(contrast(colour, colors.surface) >= UI, `${group} on surface: ${contrast(colour, colors.surface).toFixed(2)}`);
      assert.ok(contrast(colour, colors.background) >= UI, `${group} on background: ${contrast(colour, colors.background).toFixed(2)}`);
    }
  });

  test('the group colours are drawn: each group names its token in theme.ts', () => {
    const theme = read('constants/theme.ts');
    for (const group of Object.keys(ICON_GROUP_COLORS)) assert.match(theme, new RegExp(`^\\s+${group}: colors\\.\\w+,$`, 'm'), group);
  });
});
