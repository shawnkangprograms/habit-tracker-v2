import {useEffect, useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {
  MARK_POP_MS, OPTION_PRESS_DEPTH_PX, OPTION_PRESS_IN_MS, OPTION_PRESS_OUT_MS, SELECT_FADE_MS, shouldAnimate,
} from '@/utils/onboarding/motion';

// One onboarding answer row: a dark rounded card with a radio (single) or checkbox (multi). Selected: orange
// outline and tint. Dimmed: a multi question is at its limit, so this unpicked row can't be picked.
// Motion (stage 4): the row presses down about 3 px like a physical button, the selected outline and tint fade
// in (an overlay's opacity, so no colour is animated), and the dot or tick pops in. None of it under reduced
// motion. The haptic is played by the screen, which knows whether the answer changed.

const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting

export function OptionButton({label, selected, multi, dimmed = false, reduceMotion, onPress}: {
  label: string;
  selected: boolean;
  multi: boolean;
  dimmed?: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const animate = shouldAnimate(reduceMotion);
  const press = useSharedValue(0);// 0 up, 1 pressed down
  const selection = useSharedValue(selected ? 1 : 0);
  const mark = useSharedValue(1);
  const wasSelected = useRef(selected);

  useEffect(() => {
    selection.set(animate ? withTiming(selected ? 1 : 0, {duration: SELECT_FADE_MS, easing: Easing.out(Easing.quad), reduceMotion: SYSTEM}) : selected ? 1 : 0);
    if (selected && !wasSelected.current && animate) {
      mark.set(0);
      mark.set(withTiming(1, {duration: MARK_POP_MS, easing: Easing.out(Easing.back(1.6)), reduceMotion: SYSTEM}));
    } else {
      mark.set(1);
    }
    wasSelected.current = selected;
  }, [selected, animate, selection, mark]);

  const pressTo = (to: number) => {
    if (!animate) return;
    press.set(withTiming(to, {duration: to ? OPTION_PRESS_IN_MS : OPTION_PRESS_OUT_MS, easing: Easing.out(Easing.quad), reduceMotion: SYSTEM}));
  };

  const rowStyle = useAnimatedStyle(() => ({transform: [{translateY: press.get() * OPTION_PRESS_DEPTH_PX}]}));
  const overlayStyle = useAnimatedStyle(() => ({opacity: selection.get()}));
  const markStyle = useAnimatedStyle(() => ({transform: [{scale: mark.get()}]}));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => pressTo(1)}
      onPressOut={() => pressTo(0)}
      disabled={dimmed}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? {checked: selected, disabled: dimmed} : {selected, disabled: dimmed}}
      accessibilityLabel={label}>
      <Animated.View style={[styles.row, dimmed && styles.dimmed, rowStyle]}>
        <Animated.View style={[styles.selectedOverlay, overlayStyle]} pointerEvents="none" />
        <View style={[multi ? styles.checkbox : styles.radio, selected && styles.markOn]}>
          {selected && (
            <Animated.View style={markStyle}>
              {multi
                ? <MaterialCommunityIcons name="check" size={15} color={colors.white} />
                : <View style={styles.dot} />}
            </Animated.View>
          )}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const MARK = 22;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // drawn over the row's own border, so the outline and tint fade with opacity alone
  selectedOverlay: {
    position: 'absolute',
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent + '1f', // ~12% tint
  },
  dimmed: {opacity: 0.45},
  radio: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: MARK,
    height: MARK,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: {borderColor: colors.accent, backgroundColor: colors.accent},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white},
  label: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
});
