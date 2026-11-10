import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {HabitRadar} from '@/components/onboarding/habit-radar';
import {PROFILE_TITLE} from '@/utils/onboarding/copy';
import type {Plan} from '@/utils/onboarding/plan';
import {profileCard} from '@/utils/onboarding/results';

// Habit Profile (docs/ONBOARDING_SPEC.md, section 5): the radar and the "Your plan will focus on ..." card, or, when no
// scoring question was answered, the balanced line instead of a focus (utils/onboarding/results.ts)
export function HabitProfile({plan}: {plan: Pick<Plan, 'scores' | 'focus' | 'balanced'>}) {
  const card = profileCard(plan);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{PROFILE_TITLE}</Text>
      <HabitRadar scores={plan.scores} />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{card.title}</Text>
        {card.subtitle !== null && <Text style={styles.cardText}>{card.subtitle}</Text>}
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
