import {useEffect, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  Easing, Keyframe, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {selectionHaptic} from '@/services/haptics';
import {ADDED} from '@/utils/onboarding/copy';
import {
  ADDED_IN_MS, ADDED_OUT_MS, CHECK_POP_HALF_MS, ITEM_ENTER_MS, ITEM_OFFSET_PX, ROUTINE_STAGGER_MS, shouldAnimate,
  staggerDelay,
} from '@/utils/onboarding/motion';
import type {StarterPick} from '@/utils/onboarding/starters';

// One Recommended Routine card: the habit, its reason line, and a check. Tapping toggles it (with a light
// haptic); a card already created this run shows "Added" and can't be toggled. Styled like Home's habit cards.
// Motion (stage 4): cards fade and rise in 70 ms apart (capped at 280 ms), the check pops on each toggle, and
// the check cross-fades to "Added" in one fixed slot. The card's own colours change instantly. None of it under
// reduced motion.

const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting
const EASE = Easing.out(Easing.quad);

function cardEntering(index: number) {
  return new Keyframe({
    0: {opacity: 0, transform: [{translateY: ITEM_OFFSET_PX}]},
    100: {opacity: 1, transform: [{translateY: 0}], easing: Easing.out(Easing.cubic)},
  }).duration(ITEM_ENTER_MS).delay(staggerDelay(index, ROUTINE_STAGGER_MS)).reduceMotion(SYSTEM);
}

export function RoutineCard({pick, index, selected, added, disabled, reduceMotion, onToggle}: {
  pick: StarterPick;
  index: number;// position in the list, for the stagger
  selected: boolean;
  added: boolean;
  disabled: boolean;// while habits are being created
  reduceMotion: boolean;
  onToggle: () => void;
}) {
  const animate = shouldAnimate(reduceMotion);
  const tint = ICON_COLORS[pick.icon] ?? colors.accent;
  const on = selected || added;
  const pop = useSharedValue(1);
  const addedShown = useSharedValue(added ? 1 : 0);
  const wasSelected = useRef(selected);
  const wasAdded = useRef(added);

  useEffect(() => {
    if (selected !== wasSelected.current && animate) {
      pop.set(withSequence(
        withTiming(0.8, {duration: 0, reduceMotion: SYSTEM}),
        withTiming(1.1, {duration: CHECK_POP_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
        withTiming(1, {duration: CHECK_POP_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
      ));
    }
    wasSelected.current = selected;
  }, [selected, animate, pop]);

  useEffect(() => {
    if (added !== wasAdded.current) {
      addedShown.set(animate
        ? withTiming(added ? 1 : 0, {duration: added ? ADDED_IN_MS : ADDED_OUT_MS, reduceMotion: SYSTEM})
        : added ? 1 : 0);
    }
    wasAdded.current = added;
  }, [added, animate, addedShown]);

  // The check leaves faster than "Added" arrives (ADDED_OUT_MS vs ADDED_IN_MS of the same 0..1 value)
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - addedShown.get() * (ADDED_IN_MS / ADDED_OUT_MS)),
    transform: [{scale: pop.get()}],
  }));
  const addedStyle = useAnimatedStyle(() => ({opacity: addedShown.get()}));

  const toggle = () => {
    selectionHaptic();
    onToggle();
  };

  return (
    <Animated.View entering={animate ? cardEntering(index) : undefined}>
      <Pressable
        onPress={toggle}
        disabled={added || disabled}
        style={({pressed}) => [
          styles.card,
          on ? {backgroundColor: `${tint}14`, borderColor: `${tint}54`} : styles.off,
          pressed && styles.pressed,
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{checked: on, disabled: added || disabled}}
        accessibilityLabel={`${pick.habitName}. ${pick.reason}${added ? `. ${ADDED}` : ''}`}>
        <View style={[styles.badge, {backgroundColor: `${tint}30`, borderColor: `${tint}80`}, !on && styles.faded]}>
          <HabitIcon id={pick.icon} size={21} color={tint} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.name, !on && styles.faded]} numberOfLines={1}>{pick.habitName}</Text>
          <Text style={[styles.reason, !on && styles.faded]}>{pick.reason}</Text>
        </View>
        {/* one fixed slot: the check and "Added" stacked, so the cross-fade never moves the text */}
        <View style={styles.slot}>
          <Animated.View style={[styles.check, selected && styles.checkOn, checkStyle]}>
            {selected && <MaterialCommunityIcons name="check" size={15} color={colors.white} />}
          </Animated.View>
          <Animated.Text style={[styles.added, addedStyle]}>{ADDED}</Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
  },
  off: {backgroundColor: colors.surface, borderColor: colors.border},
  pressed: {opacity: 0.85},
  badge: {width: 38, height: 38, borderRadius: radii.iconBadge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  text: {flex: 1, gap: 2},
  name: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  reason: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  faded: {opacity: 0.5},
  slot: {width: 52, height: 24, alignItems: 'flex-end', justifyContent: 'center'},
  check: {
    position: 'absolute',
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {borderColor: colors.accent, backgroundColor: colors.accent},
  added: {position: 'absolute', right: 0, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.green},
});
