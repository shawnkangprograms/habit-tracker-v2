import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, spacing} from '@/constants/theme';
import {BACK, SKIP_SETUP, stepLabel} from '@/utils/onboarding/copy';
import {ProgressBar} from '@/components/onboarding/progress-bar';

// Top of every onboarding step: Back (not on step 1) and "Skip setup", then "STEP n OF 11" and the progress bar
export function StepHeader({stepIndex, count, onBack, onSkip}: {
  stepIndex: number;// 0-based
  count: number;
  onBack: () => void;
  onSkip: () => void;
}) {
  const label = stepLabel(stepIndex + 1, count);
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {stepIndex > 0 ? (
          <Pressable style={styles.back} onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={BACK}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>{BACK}</Text>
          </Pressable>
        ) : <View />}
        <Pressable onPress={onSkip} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>{SKIP_SETUP}</Text>
        </Pressable>
      </View>
      <Text style={styles.step} accessibilityLabel={`Step ${stepIndex + 1} of ${count}`}>{label}</Text>
      <ProgressBar progress={(stepIndex + 1) / count} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm},
  topRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32},
  back: {flexDirection: 'row', alignItems: 'center', marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  skip: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  step: {alignSelf: 'flex-end', fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.accent},
});
