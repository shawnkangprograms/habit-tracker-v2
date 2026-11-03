import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, spacing} from '@/constants/theme';
import {BACK, SKIP_SETUP, stepLabel} from '@/utils/onboarding/copy';
import {ProgressBar} from '@/components/onboarding/progress-bar';

// Top of every onboarding screen: Back (when allowed) and "Skip setup". On the questions, also "STEP n OF 11"
// and the progress bar; the result screens pass progress={null}.
export function StepHeader({progress, canGoBack, onBack, onSkip}: {
  progress: {index: number; count: number} | null;// index is 0-based
  canGoBack: boolean;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {canGoBack ? (
          <Pressable style={styles.back} onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={BACK}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>{BACK}</Text>
          </Pressable>
        ) : <View />}
        <Pressable onPress={onSkip} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>{SKIP_SETUP}</Text>
        </Pressable>
      </View>
      {progress && (
        <>
          <Text style={styles.step} accessibilityLabel={`Step ${progress.index + 1} of ${progress.count}`}>
            {stepLabel(progress.index + 1, progress.count)}
          </Text>
          <ProgressBar progress={(progress.index + 1) / progress.count} />
        </>
      )}
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
