// Design tokens from the HabitQuest Figma file. Use these instead of hard-coded values.

import type { IconId } from '@/constants/habits';

export const colors = {
  background: '#1a1815',
  surface: '#1e1b17', // cards
  inputFill: '#1a1815',
  border: '#332e28',
  track: '#161411', // progress ring / bar background
  text: '#f5f1e8',
  muted: '#a39c8f',
  accent: '#f2691b', // orange
  error: '#ff6b6b',
  green: '#1d9e75',
  blue: '#378add',
  pink: '#d4537e',
  amber: '#ef9f27',
  purple: '#7f77dd',
  white: '#ffffff', // primary button text
} as const;

// Streak medal materials (Profile shelf): light/base/dark make the body gradient, dark is also the ribbon.
// Locked medals use `locked`, with colors.muted for the lock and text.
export const medalTiers = {
  bronze: {light: '#e3a774', base: '#c47f45', dark: '#7a4a22'},
  silver: {light: '#e6e9ee', base: '#b8bcc4', dark: '#6d727c'},
  gold: {light: '#f7d76a', base: '#e6b422', dark: '#8f6a0c'},
  emerald: {light: '#6fe0b0', base: '#2bb57f', dark: '#11603f'},
  ruby: {light: '#f27493', base: '#d1335b', dark: '#7d1430'},
  blaze: {light: '#ffb062', base: colors.accent, dark: '#9c3a06', glow: colors.accent}, // 100 days: static glow
  locked: {light: '#4f4840', base: '#3d3832', dark: '#2a2621'},
} as const;

export const radii = {
  pill: 999, // inputs and buttons
  habitCard: 14,
  iconBadge: 11,
  largeCard: 18,
  // C1: the small shapes in use (bars, swatches, dots); values used 3+ times, the one-offs stay literal
  xxs: 2,
  xs: 3,
  sm: 4,
} as const;

// Font family names as registered by useFonts in app/_layout.tsx
export const fonts = {
  title: 'SpaceGrotesk_700Bold', // titles and buttons
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  // C1: values the screens write as literals 4 or more times (named by value, so a reader sees the number)
  s2: 2,
  s5: 5,
  s6: 6,
  s7: 7,
  s10: 10,
  s14: 14,
  s18: 18,
  s20: 20,
} as const;

// C1: the onboarding primary button's glow, the one elevation in the app (iOS shadow; Android draws the
// elevation shadow in the same colour on API 28+). `glowOff` is its disabled state.
export const shadows = {
  glow: {
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  glowOff: {shadowOpacity: 0, elevation: 0},
} as const;

export const ICON_COLORS: Record<IconId, string> = {
  book: colors.amber,
  water: colors.pink,
  run: colors.green,
  meditate: colors.purple,
  sleep: colors.purple,
  food: colors.amber,
  study: colors.blue,
  work: colors.blue,
  music: colors.purple,
  money: colors.green,
  heart: colors.pink,
  star: colors.accent,
};

// TEMPORARY until Home and Settings are restyled: the template's ThemedText/ThemedView
// read Colors via useThemeColor. Both schemes point at the dark tokens so the app stays
// dark even when the phone is in light mode (app.json userInterfaceStyle is "dark"; the app is dark-only in 1.1).
const legacyScheme = {
  text: colors.text,
  background: colors.background,
  tint: colors.accent,
  icon: colors.muted,
  tabIconDefault: colors.muted,
  tabIconSelected: colors.accent,
};

export const Colors = {
  light: legacyScheme,
  dark: legacyScheme,
};
