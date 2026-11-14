// C1: the pure parts of Button, Pill and Card: sizes, variants and the touch-target rule. Kept free of React so
// tests/ui-components.test.ts can check them under Node (a screen can't be rendered there).
import {colors, pressedOpacity, radii, spacing} from '@/constants/theme';
import {typeScale, type TypeStep, type Weight, type ColorKey} from '@/constants/typography';

export const MIN_TARGET = 48;// dp

// hitSlop that lifts a control to 48 dp without changing how it looks (C1; the visible size becomes 48 in C2).
// `gap` is the space to the next control on that axis: the slop never goes past half of it, so two neighbours' touch
// areas don't overlap. undefined = nothing to add.
export function hitSlopFor(visibleHeight: number, gap?: number): {top: number; bottom: number} | undefined {
  let perSide = Math.ceil(Math.max(0, MIN_TARGET - visibleHeight) / 2);
  if (gap !== undefined) perSide = Math.min(perSide, Math.floor(Math.max(0, gap) / 2));
  return perSide > 0 ? {top: perSide, bottom: perSide} : undefined;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const BUTTON_SIZES: Record<ButtonSize, {height: number; step: TypeStep}> = {
  sm: {height: 40, step: 'body'},
  md: {height: 52, step: 'bodyLg'},
  lg: {height: 56, step: 'base'},
};

export const BUTTON_VARIANTS: Record<ButtonVariant, {
  backgroundColor: string; borderColor?: string; textColor: ColorKey; weight: Weight;
}> = {
  primary: {backgroundColor: colors.accent, textColor: 'onAccent', weight: 'title'},// dark label: 5.75:1
  secondary: {backgroundColor: 'transparent', borderColor: colors.accent, textColor: 'accent', weight: 'semiBold'},
  ghost: {backgroundColor: 'transparent', textColor: 'muted', weight: 'semiBold'},
  danger: {backgroundColor: 'transparent', borderColor: colors.error, textColor: 'error', weight: 'semiBold'},
};

export type ButtonSpec = {
  height: number; paddingHorizontal: number; borderRadius: number; backgroundColor: string;
  borderWidth?: number; borderColor?: string; step: TypeStep; fontSize: number; textColor: ColorKey; weight: Weight;
  pressedOpacity: number;// 0.9 for the accent fill (its label keeps 4.5:1 while pressed), 0.85 otherwise
};

export function buttonSpec(variant: ButtonVariant, size: ButtonSize): ButtonSpec {
  const v = BUTTON_VARIANTS[variant];
  const s = BUTTON_SIZES[size];
  return {
    height: s.height,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: v.backgroundColor,
    ...(v.borderColor ? {borderWidth: 1, borderColor: v.borderColor} : {}),
    step: s.step,
    fontSize: typeScale[s.step],
    textColor: v.textColor,
    weight: v.weight,
    pressedOpacity: variant === 'primary' ? pressedOpacity.accent : pressedOpacity.default,
  };
}

// Pill (a chip): the Settings nudge-time chip as it is drawn today
export const PILL = {height: 34, paddingHorizontal: spacing.s14, borderRadius: radii.pill} as const;

// The accessibility props a Button hands to its Pressable: the label is always the accessible name (while loading the
// visible text is replaced by a spinner), and busy/disabled are announced
export function buttonA11y(label: string, accessibilityLabel: string | undefined, disabled: boolean, loading: boolean) {
  return {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? label,
    accessibilityState: {disabled: disabled || loading, busy: loading},
  };
}

// Row (a list row: icon, label, optional trailing content and chevron). The numbers are the ones Settings' rows and
// SwitchRow had before C2 (56 dp tall, so already above the 48 dp target); tests/ui-row.test.ts pins them.
export const ROW = {
  minHeight: 56,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,// only shows when large text makes a row taller than 56
  gap: spacing.md,
  borderRadius: radii.habitCard,
  borderWidth: 1,
  iconSize: 22,
  pressedOpacity: pressedOpacity.default,
  dimmedOpacity: 0.5,
} as const;

// The fixed, centred box that holds a native switch, so the row lays out the same whatever size the switch reports
export const SWITCH_BOX = {width: 52, height: 32, alignItems: 'center', justifyContent: 'center'} as const;

// What a Row looks like at rest (the resolved style of its Pressable)
export function rowStyle() {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW.gap,
    minHeight: ROW.minHeight,
    paddingHorizontal: ROW.paddingHorizontal,
    paddingVertical: ROW.paddingVertical,
    borderRadius: ROW.borderRadius,
    backgroundColor: colors.surface,
    borderWidth: ROW.borderWidth,
    borderColor: colors.border,
  } as const;
}
