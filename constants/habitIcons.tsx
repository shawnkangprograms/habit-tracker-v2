// Maps each stored icon id to a MaterialCommunityIcons glyph (from @expo/vector-icons).
// Every name below was checked against the installed glyph map.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { IconId } from '@/constants/habits';

type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const HABIT_ICONS: Record<IconId, GlyphName> = {
  book: 'book-open-outline',
  water: 'water-outline',
  run: 'pulse',
  meditate: 'leaf',
  sleep: 'moon-waning-crescent',
  food: 'silverware-fork-knife',
  study: 'school-outline',
  work: 'briefcase-outline',
  music: 'music-note',
  money: 'currency-usd', // no circled dollar in this icon set
  heart: 'heart-outline',
  star: 'star-outline',
};

export function HabitIcon({ id, size = 24, color }: { id: IconId; size?: number; color: string }) {
  return <MaterialCommunityIcons name={HABIT_ICONS[id]} size={size} color={color} />;
}
