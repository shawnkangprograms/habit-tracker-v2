import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {HabitRadar} from '@/components/onboarding/habit-radar';
import {FOCUS_CARDS, PROFILE_TITLE, focusTitle} from '@/utils/onboarding/copy';
import type {Scores} from '@/utils/onboarding/scoring';
import type {Axis} from '@/utils/onboarding/types';

// Habit Profile (docs/ONBOARDING_SPEC.md, section 5): the radar and the "Your plan will focus on ..." card
export function HabitProfile({scores, focus}: {scores: Scores; focus: Axis}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{PROFILE_TITLE}</Text>
      <HabitRadar scores={scores} />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{focusTitle(focus)}</Text>
        <Text style={styles.cardText}>{FOCUS_CARDS[focus].subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.lg},
  title: {fontFamily: fonts.title, fontSize: 28, lineHeight: 36, color: colors.text},// see app/onboarding.tsx
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.largeCard,
    backgroundColor: colors.accent + '14', // ~8% tint
    borderWidth: 1,
    borderColor: colors.accent + '54', // ~33%
  },
  cardTitle: {fontFamily: fonts.title, fontSize: 17, color: colors.text},
  cardText: {fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.muted},
});
