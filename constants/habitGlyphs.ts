// Maps each stored icon id to a MaterialCommunityIcons glyph name. Pure (a type import only), so it runs under Node's
// test runner; constants/habitIcons.tsx draws the glyph. Every name below was checked against the installed glyph map.
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type {ComponentProps} from 'react';
import type {IconId} from '@/constants/habits';

export type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

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

// What an icon id this build doesn't know (written by a newer build) is drawn as
export const FALLBACK_GLYPH: GlyphName = HABIT_ICONS.star;

export function glyphFor(id: string): GlyphName {
  return Object.prototype.hasOwnProperty.call(HABIT_ICONS, id) ? HABIT_ICONS[id as IconId] : FALLBACK_GLYPH;
}
