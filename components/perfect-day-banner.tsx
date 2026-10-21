import {useEffect} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet, Text} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeInUp, FadeOut, ReduceMotion} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {successHaptic} from '@/services/haptics';
import {colors, fonts, radii, spacing} from '@/constants/theme';

export const NOTICE_MS = 3000;

// Perfect-day banner at the top of Home: success haptic, gone after about 3 s or on tap.
// Unmounting (e.g. Home losing focus) clears the timer.
export function PerfectDayBanner({text, onDismiss}: {text: string; onDismiss: () => void}) {
  // Absolute children ignore the parent SafeAreaView's padding, so the notch / status bar inset
  // (edge-to-edge on Android too) is added here
  const insets = useSafeAreaInsets();

  useEffect(() => {
    successHaptic();
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(onDismiss, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [text, onDismiss]);

  return (
    <Animated.View
      style={[styles.wrap, {top: insets.top + spacing.sm}]}
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.System)}>
      <Pressable style={styles.banner} onPress={onDismiss} accessibilityRole="button" accessibilityHint="Dismisses the message">
        <MaterialCommunityIcons name="star-four-points" size={18} color={colors.green} />
        <Text style={styles.text} numberOfLines={2}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', left: spacing.lg, right: spacing.lg},
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.green + '80',
    backgroundColor: colors.surface,
  },
  text: {flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
});
