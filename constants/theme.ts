// Design tokens from the HabitQuest Figma file. Use these instead of hard-coded values.

import {HABIT_ICON_SET, LEGACY_ICON_IDS, type IconGroup, type IconId} from '@/constants/habitIconSet';

type LegacyIconId = (typeof LEGACY_ICON_IDS)[number];

// Palette B (C1b, docs/HABITQUEST_DESIGN.md): the warm dark base and the orange stay; the ratios are pinned in
// tests/palette.test.ts. Every colour here is #rrggbb (a screen may add two hex digits of alpha to one, e.g.
// colors.error + '14'), except the two scrims, which are whole rgba() values and never get a suffix.
export const colors = {
  background: '#1a1815',
  surface: '#221f1a', // cards, the tab bar
  raised: '#2a2620', // dialogs and floating cards: the celebration overlay, skip dialog, toast, perfect-day banner, reflection bar
  inputFill: '#1a1815',
  border: '#332e28', // card borders (decorative)
  inputBorder: '#756a5c', // text fields and the time field: 3:1 against their fill and the surface
  track: '#161411', // progress ring / bar background
  text: '#f5f1e8',
  muted: '#b0a99b',
  accent: '#f2691b', // orange
  onAccent: '#1a1815', // text and marks on a solid accent fill (5.75:1); white there is only 3.08:1
  error: '#ff7a7a',
  success: '#2bb584', // status: done, on time, saved, perfect day, vitality
  green: '#1d9e75', // a category colour (habit icons, charts), not a status
  blue: '#378add',
  pink: '#e0658f',
  amber: '#ef9f27',
  purple: '#7f77dd',
  white: '#ffffff', // the switch thumb, the slider thumb and the medal numbers (never text on the accent)
  scrim: 'rgba(0, 0, 0, 0.6)', // behind the onboarding skip dialog
  scrimStrong: 'rgba(10, 9, 8, 0.82)', // behind the celebration overlay
} as const;

// Pressed feedback: a control filled with the accent presses to 0.9, so its dark label keeps 4.5:1 (4.87 over the page;
// 0.85 gives 4.49); every other pressable (rows, outlined and ghost buttons, cards) stays at 0.85
export const pressedOpacity = {default: 0.85, accent: 0.9} as const;

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

// The colour of each icon group (C3), from the existing tokens only: the same area colours the admin stats screen uses
// (Health green, Mind purple, Career blue, Discipline accent, Learning amber, Relations pink), and the accent for
// General, like the star. A colour is never the only cue: every icon has a spoken label and a caption in the picker.
// tests/palette.test.ts checks each group colour as an icon on the surface (3:1).
export const ICON_GROUP_COLORS: Record<IconGroup, string> = {
  Health: colors.green,
  Mind: colors.purple,
  Discipline: colors.accent,
  Career: colors.blue,
  Learning: colors.amber,
  Relations: colors.pink,
  General: colors.accent,
};

// The twelve icons of 1.0 keep the colours they always had (some differ from their group's: water pink, sleep purple,
// food amber, study blue, money green); every other icon takes its group's colour.
const LEGACY_ICON_COLORS: Record<LegacyIconId, string> = {
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

export const ICON_COLORS = {
  ...Object.fromEntries(HABIT_ICON_SET.map((icon) => [icon.id, ICON_GROUP_COLORS[icon.group]])),
  ...LEGACY_ICON_COLORS,
} as Record<IconId, string>;

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
