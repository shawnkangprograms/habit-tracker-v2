// Stage C1: the design tokens (constants/typography.ts, and the spacing, radii and shadows added to constants/theme.ts).
// The scale codifies the sizes in use on 2026-11-14; these tests pin the mapping from every old size to its step
// (never a move of more than 1 px), keep the token tables free of duplicates, and ratchet the literals that are still
// written by hand so they can only go down as screens migrate.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const typo = await import('../constants/typography.ts');
const theme = await import('../constants/theme.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}
const SCREEN_FILES = [...sourceFiles('app'), ...sourceFiles('components')];

// every `fontSize: N` literal in the app and components
function fontSizeLiterals(): number[] {
  return SCREEN_FILES.flatMap((file) => [...read(file).matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])));
}

describe('the type scale', () => {
  test('at most 8 steps, all different sizes', () => {
    const sizes = Object.values(typo.typeScale);
    assert.ok(sizes.length <= 8, String(sizes.length));
    assert.equal(new Set(sizes).size, sizes.length);
  });

  test('the steps are the exact sizes 11, 12, 13, 14, 15, 16, 26, 32', () => {
    assert.deepEqual(Object.values(typo.typeScale), [11, 12, 13, 14, 15, 16, 26, 32]);
  });

  test('every mapped old size is within 1 px of its step; the two snaps are 10 -> micro and 17 -> base', () => {
    const snaps: string[] = [];
    for (const [size, {step}] of Object.entries(typo.SIZE_MAP)) {
      if (step === null) continue;
      const move = typo.typeScale[step] - Number(size);
      assert.ok(Math.abs(move) <= 1, `${size} -> ${step}`);
      if (move !== 0) snaps.push(`${size}->${step}`);
    }
    assert.deepEqual(snaps.sort(), ['10->micro', '17->base']);
  });

  test('the map accounts for the 298 literals found on 2026-11-14: 265 exact, 10 snapped, 23 left as literals', () => {
    let exact = 0, snapped = 0, literal = 0, total = 0;
    for (const [size, {step, uses}] of Object.entries(typo.SIZE_MAP)) {
      total += uses;
      if (step === null) literal += uses;
      else if (typo.typeScale[step] === Number(size)) exact += uses;
      else snapped += uses;
    }
    assert.deepEqual({total, exact, snapped, literal}, {total: 298, exact: 265, snapped: 10, literal: 23});
  });

  test('every font size written in the source is known to the map (a new size has to be decided on purpose)', () => {
    for (const size of fontSizeLiterals()) assert.ok(size in typo.SIZE_MAP, `fontSize ${size} is not in SIZE_MAP`);
  });

  test('ratchet: hand-written font sizes, and those the scale cannot hold, only go down as screens migrate', () => {
    const sizes = fontSizeLiterals();
    const offScale = sizes.filter((s) => typo.SIZE_MAP[s]?.step === null).length;
    assert.ok(sizes.length <= 290, `fontSize literals: ${sizes.length} (290 after the Settings pilot)`);
    assert.ok(offScale <= 23, `off-scale literals: ${offScale}`);
  });

  test('no component or token file uses fontWeight (a custom font on Android ignores it)', () => {
    for (const file of ['constants/typography.ts', ...sourceFiles('components/ui')]) assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /fontWeight/, file);// code only
  });

  test('textStyle: the face, size and colour of each variant; label is 11 px bold with letter spacing 0.9', () => {
    assert.deepEqual(typo.textStyle('title'), {fontFamily: theme.fonts.title, fontSize: 26, color: theme.colors.text});
    assert.deepEqual(typo.textStyle('bodyLg', 'semiBold'), {fontFamily: theme.fonts.semiBold, fontSize: 15, color: theme.colors.text});
    assert.deepEqual(typo.textStyle('small', undefined, 'muted'), {fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.muted});
    assert.deepEqual(typo.textStyle('label', undefined, 'muted'), {fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.muted, letterSpacing: 0.9});
    for (const variant of Object.keys(typo.DEFAULT_WEIGHT) as (keyof typeof typo.DEFAULT_WEIGHT)[]) {
      assert.ok(!('lineHeight' in typo.textStyle(variant)), `${variant} must not set lineHeight`);
    }
  });

  test('the five faces are the only ones a variant can pick', () => {
    assert.deepEqual(Object.values(theme.fonts).sort(), ['Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold', 'SpaceGrotesk_700Bold']);
  });
});

describe('token uniqueness', () => {
  const dupes = (table: Record<string, unknown>) => {
    const seen = new Map<unknown, string>();
    const out: string[] = [];
    for (const [key, value] of Object.entries(table)) {
      if (seen.has(value)) out.push(`${seen.get(value)}=${key}`);
      else seen.set(value, key);
    }
    return out;
  };

  test('spacing: no two names for one value, and the C1 additions are the values used 4 or more times', () => {
    assert.deepEqual(dupes(theme.spacing), []);
    assert.deepEqual(
      [theme.spacing.s2, theme.spacing.s5, theme.spacing.s6, theme.spacing.s7, theme.spacing.s10, theme.spacing.s14, theme.spacing.s18, theme.spacing.s20],
      [2, 5, 6, 7, 10, 14, 18, 20],
    );
  });

  test('radii: no two names for one value; the new small ones are 2, 3 and 4', () => {
    assert.deepEqual(dupes(theme.radii), []);
    assert.deepEqual([theme.radii.xxs, theme.radii.xs, theme.radii.sm], [2, 3, 4]);
  });

  test('colours: the only repeated values are the input fill and the ink on the accent, both the background today', () => {
    // separate names on purpose: the fill of a field and the label on an orange fill can change apart from the page
    assert.deepEqual(dupes(theme.colors), ['background=inputFill', 'background=onAccent']);
    assert.equal(theme.colors.accent, '#f2691b');
    assert.equal(theme.colors.surface, '#221f1a');// palette B (C1b); tests/palette.test.ts pins the rest
    assert.equal(theme.colors.border, '#332e28');
  });

  test('the glow is the onboarding primary button\'s shadow, and onboarding takes it from the token (C1b: no second copy)', () => {
    assert.deepEqual(theme.shadows.glow, {
      shadowColor: theme.colors.accent, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: {width: 0, height: 4}, elevation: 6,
    });
    assert.deepEqual(theme.shadows.glowOff, {shadowOpacity: 0, elevation: 0});
    const onboarding = read('app/onboarding.tsx');
    assert.match(onboarding, /\.\.\.shadows\.glow,/);
    assert.match(onboarding, /primaryOff: \{opacity: 0\.4, \.\.\.shadows\.glowOff\}/);
    assert.doesNotMatch(onboarding, /shadowOpacity|shadowRadius|shadowOffset|elevation:/);
  });

  test('no motion tokens yet (deferred until a screen adopts them)', () => {
    assert.equal('motion' in theme, false);
  });
});
