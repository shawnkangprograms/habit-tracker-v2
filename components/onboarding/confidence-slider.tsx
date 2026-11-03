import {useEffect, useRef} from 'react';
import {StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {colors, fonts, spacing} from '@/constants/theme';
import {selectionHaptic} from '@/services/haptics';
import {CONFIDENCE_HIGH_LABEL, CONFIDENCE_LOW_LABEL} from '@/utils/onboarding/copy';
import {
  NUMBER_BUMP_DOWN_MS, NUMBER_BUMP_SCALE, NUMBER_BUMP_UP_MS, THUMB_GLIDE_MS, THUMB_HOLD_MS, THUMB_HOLD_SCALE,
  shouldAnimate,
} from '@/utils/onboarding/motion';
import {CONFIDENCE_MAX, CONFIDENCE_MIN} from '@/utils/onboarding/types';

// The Q11 slider, 1 to 10. Custom (no slider package in the build): gesture-handler for drag and tap, with the
// thumb and fill moved on the UI thread by Reanimated; the value reaches React only when the step changes, with
// a light haptic. Motion (stage 4): the thumb grows while held and glides between steps, and the big number
// bumps on every change; under reduced motion the thumb jumps and nothing scales. Screen readers get one
// adjustable element with increment and decrement actions.
//
// The app root has no GestureHandlerRootView, so the slider brings its own.

const THUMB = 30;
const RANGE = CONFIDENCE_MAX - CONFIDENCE_MIN;
const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting
const EASE = Easing.out(Easing.quad);

export function ConfidenceSlider({value, onChange, label, reduceMotion}: {
  value: number;
  onChange: (value: number) => void;
  label: string;// read by screen readers with the value
  reduceMotion: boolean;
}) {
  const animate = shouldAnimate(reduceMotion);
  const width = useSharedValue(0);// the track's width, from layout
  const shown = useSharedValue(value);// the step picked: set on the UI thread while dragging, and from `value`
  const position = useSharedValue(value);// where the thumb is drawn: glides to `shown`
  const held = useSharedValue(0);
  const bump = useSharedValue(1);
  const lastValue = useRef(value);
  // get()/set() rather than .value: these are also effect dependencies, and the React Compiler lint rejects
  // assigning .value to them (Reanimated's accessors are the compiler-safe form)

  useEffect(() => {
    shown.set(value);
    position.set(animate ? withTiming(value, {duration: THUMB_GLIDE_MS, easing: EASE, reduceMotion: SYSTEM}) : value);
    if (value !== lastValue.current && animate) {
      bump.set(withSequence(
        withTiming(NUMBER_BUMP_SCALE, {duration: NUMBER_BUMP_UP_MS, easing: EASE, reduceMotion: SYSTEM}),
        withTiming(1, {duration: NUMBER_BUMP_DOWN_MS, easing: EASE, reduceMotion: SYSTEM}),
      ));
    }
    lastValue.current = value;
  }, [value, animate, shown, position, bump]);

  const changed = (next: number) => {
    selectionHaptic();
    onChange(next);
  };

  // x is from the touch area's left edge, which sits half a thumb before the track's
  const pick = (touchX: number) => {
    'worklet';
    if (width.get() <= 0) return;
    const x = touchX - THUMB / 2;
    const ratio = Math.min(1, Math.max(0, x / width.get()));
    const next = CONFIDENCE_MIN + Math.round(ratio * RANGE);
    if (next === shown.get()) return;
    shown.set(next);
    position.set(animate ? withTiming(next, {duration: THUMB_GLIDE_MS, easing: EASE, reduceMotion: SYSTEM}) : next);
    scheduleOnRN(changed, next);
  };

  const hold = (on: boolean) => {
    'worklet';
    if (!animate) return;
    held.set(withTiming(on ? 1 : 0, {duration: THUMB_HOLD_MS, easing: EASE, reduceMotion: SYSTEM}));
  };

  // A horizontal drag picks as it moves; a vertical one is left to the scroll view. A tap picks where it lands.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin(() => hold(true))
    .onStart((e) => pick(e.x))
    .onUpdate((e) => pick(e.x))
    .onFinalize(() => hold(false));
  const tap = Gesture.Tap()
    .onBegin(() => hold(true))
    .onEnd((e, success) => {
      if (success) pick(e.x);
    })
    .onFinalize(() => hold(false));
  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: ((position.get() - CONFIDENCE_MIN) / RANGE) * width.get()},
      {scale: 1 + held.get() * (THUMB_HOLD_SCALE - 1)},
    ],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{scaleX: (position.get() - CONFIDENCE_MIN) / RANGE}],
  }));
  const numberStyle = useAnimatedStyle(() => ({transform: [{scale: bump.get()}]}));

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && value < CONFIDENCE_MAX) changed(value + 1);
    if (e.nativeEvent.actionName === 'decrement' && value > CONFIDENCE_MIN) changed(value - 1);
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{min: CONFIDENCE_MIN, max: CONFIDENCE_MAX, now: value, text: `${value} of ${CONFIDENCE_MAX}`}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={onAccessibilityAction}>
      <Animated.View style={numberStyle}>
        <Text style={styles.number}>{value}</Text>
      </Animated.View>

      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={gesture}>
          {/* the touch area is taller than the track and half a thumb wider on each side */}
          <View style={styles.touch}>
            <View style={styles.trackArea} onLayout={onLayout}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, fillStyle]} />
              </View>
              <Animated.View style={[styles.thumb, thumbStyle]} />
            </View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>

      <View style={styles.ends}>
        <Text style={styles.endLabel}>{CONFIDENCE_LOW_LABEL}</Text>
        <Text style={styles.endLabel}>{CONFIDENCE_HIGH_LABEL}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: spacing.xxl, gap: spacing.md},
  number: {fontFamily: fonts.title, fontSize: 64, lineHeight: 72, color: colors.accent, textAlign: 'center'},
  root: {flexGrow: 0},
  touch: {height: 48, justifyContent: 'center', paddingHorizontal: THUMB / 2},
  trackArea: {height: THUMB, justifyContent: 'center'},
  track: {height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {flex: 1, backgroundColor: colors.accent, transformOrigin: 'left'},
  thumb: {
    position: 'absolute',
    left: -THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  ends: {flexDirection: 'row', justifyContent: 'space-between'},
  endLabel: {fontFamily: fonts.medium, fontSize: 12, color: colors.muted},
});
