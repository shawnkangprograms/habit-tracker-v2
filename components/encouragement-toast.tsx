import {useEffect} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet, Text} from 'react-native';
import Animated, {FadeInDown, FadeOut, ReduceMotion} from 'react-native-reanimated';
import {NOTICE_MS} from '@/components/perfect-day-banner';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// Small encouragement at the bottom of Home, above the tab bar: gone after about 3 s or on tap.
// No bottom inset here: Home's scene ends at the top of the tab bar, which already includes the inset.
// No haptic (the tick already gave one). Unmounting (e.g. Home losing focus) clears the timer.
export function EncouragementToast({text, onDismiss}: {text: string; onDismiss: () => void}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(onDismiss, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [text, onDismiss]);

  return (
    <Animated.View
      style={styles.wrap}
      pointerEvents="box-none"
      entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}>
      <Pressable style={styles.toast} onPress={onDismiss} accessibilityRole="button" accessibilityHint="Dismisses the message">
        <Text style={styles.text} numberOfLines={2}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', bottom: spacing.md, left: spacing.lg, right: spacing.lg, alignItems: 'center'},
  toast: {
    maxWidth: 420,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: {fontFamily: fonts.medium, fontSize: 13, color: colors.text, textAlign: 'center'},
});
