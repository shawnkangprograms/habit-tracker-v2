// C1: the type scale. It CODIFIES the font sizes in use today (265 of the 298 literals are exactly one of these
// steps); it is not the final 1.1 scale. It gains a heading step when the screens migrate (C5).
// Pure: no React, no native modules (tests/ui-tokens.test.ts reads it under Node).
//
// A step is a size only. No line height: the existing line heights disagree per size (15 uses 22, 13 uses 18 and 19,
// 16 uses 22 and 23), so a per-size token would change text. AppText leaves lineHeight unset unless a screen passes one.
// The weight is one of the five registered faces (constants/theme.ts `fonts`); fontWeight is never used, because a
// custom font on Android ignores it.

import {colors, fonts} from '@/constants/theme';

export const typeScale = {
  micro: 11,
  caption: 12,
  small: 13,
  body: 14,
  bodyLg: 15,
  base: 16,
  title: 26,
  display: 32,
} as const;

export type TypeStep = keyof typeof typeScale;
export type Variant = TypeStep | 'label';
export type Weight = keyof typeof fonts;
export type ColorKey = keyof typeof colors;

// The face a variant uses when the caller gives none. `label` is the 11 px bold, letter-spaced caption used above fields.
export const DEFAULT_WEIGHT: Record<Variant, Weight> = {
  micro: 'regular',
  caption: 'regular',
  small: 'regular',
  body: 'regular',
  bodyLg: 'regular',
  base: 'regular',
  title: 'title',
  display: 'title',
  label: 'bold',
};

export const LABEL_LETTER_SPACING = 0.9;

// Every font size written in the app on 2026-11-14 -> the step it belongs to, or null (stays a literal). `change` is
// the move in px when the size is applied to the step (never more than 1). The snaps (10 -> micro, 17 -> base) are
// recorded, NOT applied by C1: no screen has a 10 or a 17 migrated, so nothing visible moves.
export const SIZE_MAP: Record<number, {step: TypeStep | null; uses: number}> = {
  8: {step: null, uses: 1},
  9: {step: null, uses: 1},
  10: {step: 'micro', uses: 6},
  11: {step: 'micro', uses: 35},
  12: {step: 'caption', uses: 47},
  13: {step: 'small', uses: 44},
  14: {step: 'body', uses: 70},
  15: {step: 'bodyLg', uses: 25},
  16: {step: 'base', uses: 23},
  17: {step: 'base', uses: 4},
  18: {step: null, uses: 4},
  20: {step: null, uses: 5},
  21: {step: null, uses: 1},
  22: {step: null, uses: 3},
  26: {step: 'title', uses: 7},
  28: {step: null, uses: 4},
  30: {step: null, uses: 2},
  32: {step: 'display', uses: 14},
  40: {step: null, uses: 1},
  64: {step: null, uses: 1},
};

export type TextStyleSpec = {fontFamily: string; fontSize: number; color: string; letterSpacing?: number};

// The style an AppText applies before the caller's own `style`
export function textStyle(variant: Variant, weight?: Weight, color: ColorKey = 'text'): TextStyleSpec {
  const fontSize = variant === 'label' ? typeScale.micro : typeScale[variant];
  const spec: TextStyleSpec = {fontFamily: fonts[weight ?? DEFAULT_WEIGHT[variant]], fontSize, color: colors[color]};
  if (variant === 'label') spec.letterSpacing = LABEL_LETTER_SPACING;
  return spec;
}
