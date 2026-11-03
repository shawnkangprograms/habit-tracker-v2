import {StyleSheet, Text, View} from 'react-native';
import Animated, {Easing, Keyframe, ReduceMotion} from 'react-native-reanimated';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {
  CHALLENGE_CARD_LABEL, CHALLENGE_LINES, DAY1_MOVES, DAY1_TITLE, DERAILS_CARD_LABEL, DERAIL_LINES, RHYTHM_CARD_LABEL,
  RHYTHM_LINES, TOLD_US_TITLE,
} from '@/utils/onboarding/copy';
import {ITEM_ENTER_MS, ITEM_OFFSET_PX, TOLD_US_STAGGER_MS, shouldAnimate, staggerDelay} from '@/utils/onboarding/motion';
import type {Axis, CompleteAnswers} from '@/utils/onboarding/types';

// "What you told us" (docs/ONBOARDING_SPEC.md, section 5): three first-person cards reflecting the challenge,
// the rhythm of the days and what derails the user, then the focus axis's three day-1 moves (copy doc section 5).
// Motion (stage 4): the six items fade and rise in, 60 ms apart (the last starts at 300 ms). Enter only; none
// under reduced motion.

// Opacity and a short rise, staggered by the item's index
function itemEntering(index: number) {
  return new Keyframe({
    0: {opacity: 0, transform: [{translateY: ITEM_OFFSET_PX}]},
    100: {opacity: 1, transform: [{translateY: 0}], easing: Easing.out(Easing.cubic)},
  }).duration(ITEM_ENTER_MS).delay(staggerDelay(index, TOLD_US_STAGGER_MS)).reduceMotion(ReduceMotion.System);
}

export function ToldUs({answers, focus, reduceMotion}: {
  answers: Pick<CompleteAnswers, 'challenge' | 'days' | 'derails'>;
  focus: Axis;
  reduceMotion: boolean;
}) {
  const animate = shouldAnimate(reduceMotion);
  const entering = (index: number) => (animate ? itemEntering(index) : undefined);
  const cards = [
    {label: CHALLENGE_CARD_LABEL, line: CHALLENGE_LINES[answers.challenge]},
    {label: RHYTHM_CARD_LABEL, line: RHYTHM_LINES[answers.days]},
    {label: DERAILS_CARD_LABEL, line: DERAIL_LINES[answers.derails]},
  ];
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{TOLD_US_TITLE}</Text>

      <View style={styles.cards}>
        {cards.map((card, i) => (
          <Animated.View key={card.label} style={styles.card} entering={entering(i)}>
            <Text style={styles.label}>{card.label}</Text>
            <Text style={styles.line}>{`“${card.line}”`}</Text>
          </Animated.View>
        ))}
      </View>

      <Text style={styles.subtitle} accessibilityRole="header">{DAY1_TITLE}</Text>
      <View style={styles.moves}>
        {DAY1_MOVES[focus].map((move, i) => (
          <Animated.View key={move.when} style={styles.move} entering={entering(cards.length + i)}>
            <Text style={styles.when}>{move.when.toUpperCase()}</Text>
            <View style={styles.moveText}>
              <Text style={styles.moveTitle}>{move.title}</Text>
              <Text style={styles.moveLine}>{move.line}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.lg},
  title: {fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text},
  cards: {gap: spacing.sm},
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.accent},
  line: {fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22, color: colors.text},
  subtitle: {fontFamily: fonts.title, fontSize: 18, color: colors.text, marginTop: spacing.sm},
  moves: {gap: spacing.md},
  move: {flexDirection: 'row', gap: spacing.md},
  when: {width: 84, paddingTop: 2, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  moveText: {flex: 1, gap: 2},
  moveTitle: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  moveLine: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
});
