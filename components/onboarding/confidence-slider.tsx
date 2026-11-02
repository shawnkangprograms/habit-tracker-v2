import {useEffect} from 'react';
import {StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {colors, fonts, spacing} from '@/constants/theme';
import {CONFIDENCE_HIGH_LABEL, CONFIDENCE_LOW_LABEL} from '@/utils/onboarding/copy';
import {CONFIDENCE_MAX, CONFIDENCE_MIN} from '@/utils/onboarding/types';

// The Q11 slider, 1 to 10. Custom (no slider package in the build): gesture-handler for drag and tap, with the
// thumb and fill moved on the UI thread by Reanimated; the value reaches React only when the step changes.
// The thumb snaps from step to step (stage 4 adds the polish). Screen readers get one adjustable element with
// increment and decrement actions.
//
// The app root has no GestureHandlerRootView, so the slider brings its own.

const THUMB = 30;
const RANGE = CONFIDENCE_MAX - CONFIDENCE_MIN;

export function ConfidenceSlider({value, onChange, label}: {
  value: number;
  onChange: (value: number) => void;
  label: string;// read by screen readers with the value
}) {
  const width = useSharedValue(0);// the track's width, from layout
  const shown = useSharedValue(value);// the step drawn: set on the UI thread while dragging, and from `value`
  // get()/set() rather than .value: `shown` is also an effect dependency, and the React Compiler lint rejects
  // assigning .value to it (Reanimated's accessors are the compiler-safe form)

  useEffect(() => {
    shown.set(value);
  }, [value, shown]);

  // x is from the touch area's left edge, which sits half a thumb before the track's
  const pick = (touchX: number) => {
    'worklet';
    if (width.get() <= 0) return;
    const x = touchX - THUMB / 2;
    const ratio = Math.min(1, Math.max(0, x / width.get()));
    const next = CONFIDENCE_MIN + Math.round(ratio * RANGE);
    if (next === shown.get()) return;
    shown.set(next);
    scheduleOnRN(onChange, next);
  };

  // A horizontal drag picks as it moves; a vertical one is left to the scroll view. A tap picks where it lands.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart((e) => pick(e.x))
    .onUpdate((e) => pick(e.x));
  const tap = Gesture.Tap().onEnd((e, success) => {
    if (success) pick(e.x);
  });
  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{translateX: ((shown.get() - CONFIDENCE_MIN) / RANGE) * width.get()}],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{scaleX: (shown.get() - CONFIDENCE_MIN) / RANGE}],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && value < CONFIDENCE_MAX) onChange(value + 1);
    if (e.nativeEvent.actionName === 'decrement' && value > CONFIDENCE_MIN) onChange(value - 1);
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
      <Text style={styles.number}>{value}</Text>

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
