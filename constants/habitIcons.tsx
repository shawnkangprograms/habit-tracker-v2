// Draws a stored icon id with a MaterialCommunityIcons glyph (from @expo/vector-icons); the id-to-glyph table and the
// fallback for an id this build doesn't know are in constants/habitGlyphs.ts.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {glyphFor} from '@/constants/habitGlyphs';

export function HabitIcon({ id, size = 24, color }: { id: string; size?: number; color: string }) {
  return <MaterialCommunityIcons name={glyphFor(id)} size={size} color={color} />;
}
