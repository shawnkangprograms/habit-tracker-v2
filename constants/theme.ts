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

export const radii = {
  pill: 999, // inputs and buttons
  habitCard: 14,
  iconBadge: 11,
  largeCard: 18,
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
// dark even when the phone is in light mode (app.json userInterfaceStyle is "automatic").
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
