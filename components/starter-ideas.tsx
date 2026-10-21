import {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {getStarterIdeas} from '@/services/catalogSuggestions';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import type {StarterIdea} from '@/utils/starterIdeas';

export type {StarterIdea} from '@/utils/starterIdeas'; // already validated by getStarterIdeas

// "Starter ideas" chips for the New habit screen. Fetches once on mount; renders nothing while loading.
// Never empty after that: the catalog, or three built-in starters when it is unavailable.
export function StarterIdeas({onPick}: {onPick: (idea: StarterIdea) => void}) {
  const [ideas, setIdeas] = useState<StarterIdea[]>([]);

  useEffect(() => {
    let active = true; // a read that finishes after leaving the screen is ignored
    getStarterIdeas().then((result: StarterIdea[]) => {
      if (active) setIdeas(result);
    });
    return () => { active = false; };
  }, []);

  if (ideas.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>STARTER IDEAS</Text>
      {/* nested scroll views need their own keyboardShouldPersistTaps, or the first tap only closes the keyboard */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroller}
        contentContainerStyle={styles.row}>
        {ideas.map((idea) => {
          const tint = ICON_COLORS[idea.icon];
          return (
            <Pressable
              key={idea.id}
              onPress={() => onPick(idea)}
              style={({pressed}) => [styles.chip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Use starter idea ${idea.habitName}`}>
              <HabitIcon id={idea.icon} size={16} color={tint} />
              <Text style={styles.chipText} numberOfLines={1}>{idea.habitName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginTop: spacing.xl},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted, marginBottom: spacing.sm},
  scroller: {marginHorizontal: -spacing.lg}, // run edge to edge; the padding below keeps the first chip aligned
  row: {paddingHorizontal: spacing.lg, gap: spacing.sm},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 39,
    maxWidth: 220,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {flexShrink: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.text},
  pressed: {opacity: 0.85},
});
