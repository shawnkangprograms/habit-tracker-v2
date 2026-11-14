// Maps each stored icon id to a MaterialCommunityIcons glyph name. Pure (type imports and the pure icon set only), so it
// runs under Node's test runner; constants/habitIcons.tsx draws the glyph. The table is built from the whole icon set
// (constants/habitIconSet.ts), so a build draws every id of the set even while the release switch holds the new ones
// back from the picker. tests/icon-set.test.ts checks every glyph name against the installed glyph map.
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type {ComponentProps} from 'react';
import {HABIT_ICON_SET, type IconId} from '@/constants/habitIconSet';

export type GlyphName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const HABIT_ICONS = Object.fromEntries(HABIT_ICON_SET.map((icon) => [icon.id, icon.glyph])) as Record<IconId, GlyphName>;

// What an icon id this build doesn't know (written by a newer build) is drawn as
export const FALLBACK_GLYPH: GlyphName = HABIT_ICONS.star;

export function glyphFor(id: string): GlyphName {
  return Object.prototype.hasOwnProperty.call(HABIT_ICONS, id) ? HABIT_ICONS[id as IconId] : FALLBACK_GLYPH;
}
