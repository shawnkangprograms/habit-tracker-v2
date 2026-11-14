import {useEffect, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {FadeIn, FadeInDown, FadeOut, ReduceMotion} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {barDuration, type ReflectionBar as Bar} from '@/utils/reflections/bar';
import {createBarTimer} from '@/utils/reflections/barTimer';
import {BAR_BUTTON, BAR_HINT, BAR_REWARD, barAnnouncement, barLabel, barText} from '@/utils/reflections/copy';

// The reflection offer after a tick (docs/PACKS_REPORTS_SPEC.md, section 16). Home docks it below its scroll view,
// above the tab bar, so it shrinks the list's viewport and never covers a row. One button: tapping anywhere
// opens the reflection. Gone after 8 s (20 s with a screen reader on), counted only while `covered` is false (a
// level-up or streak overlay hides it; R-3): uncovered, it gets its full time again, and its announcement waits until
// it is first uncovered (utils/reflections/barTimer.ts). Keyed by bar id, so the next tick's bar mounts fresh with its
// own timer and announcement. Slides up, or only fades under reduce motion.
export function ReflectionBar({bar, covered, reduceMotion, onOpen, onExpire}: {
  bar: Bar;
  covered: boolean;
  reduceMotion: boolean;
  onOpen: (bar: Bar) => void;
  onExpire: (id: number) => void;
}) {
  // made once per bar: the bar is keyed by its id (so id and name never change for this mount) and Home's onExpire
  // is a stable callback
  const [timer] = useState(() => createBarTimer({
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    onExpire: () => onExpire(bar.id),
    announce: () => AccessibilityInfo.announceForAccessibility(barAnnouncement(bar.habitName)),
  }));

  // 8 s, or 20 s with a screen reader: unknown (nothing runs) until the check answers
  const [durationMs, setDurationMs] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((screenReader) => {
        if (!cancelled) setDurationMs(barDuration(screenReader));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    timer.update({covered, durationMs});
  }, [timer, covered, durationMs]);
  useEffect(() => () => timer.dispose(), [timer]);

  const entering = (reduceMotion ? FadeIn : FadeInDown).duration(200).reduceMotion(ReduceMotion.System);
  return (
    <Animated.View style={styles.dock} entering={entering} exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}>
      <Pressable
        style={({pressed}) => [styles.bar, pressed && styles.pressed]}
        onPress={() => onOpen(bar)}
        accessibilityRole="button"
        accessibilityLabel={barLabel(bar.habitName)}
        accessibilityHint={BAR_HINT}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={colors.accent} />
        <Text style={styles.text} numberOfLines={1}>{barText(bar.habitName)}</Text>
        <View style={styles.reward}>
          <Text style={styles.rewardText}>{BAR_REWARD}</Text>
        </View>
        <Text style={styles.button}>{BAR_BUTTON}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.background},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: `${colors.accent}73`,
    backgroundColor: colors.surface,
  },
  pressed: {opacity: 0.85},
  text: {flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text},
  reward: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: `${colors.accent}26`},
  rewardText: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.accent},
  button: {fontFamily: fonts.title, fontSize: 14, color: colors.accent},
});
