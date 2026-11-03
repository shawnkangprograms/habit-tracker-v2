import {useEffect} from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors} from '@/constants/theme';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {PROGRESS_MS, shouldAnimate} from '@/utils/onboarding/motion';

// Thin orange progress bar with a glowing head. The fill is a scaleX transform from the left edge and the head
// a translateX, both animated on the UI thread on every step change. Starts at its value (nothing animates on
// mount). The glow is a larger faded dot behind the head, not a shadow: shadows on moving views are costly on
// low-end Android. It reads the reduce-motion setting itself (its parent takes no motion prop); it never
// animates on mount, so the hook's first false reading can't move anything.

const HEAD = 8;
const GLOW = 16;

export function ProgressBar({progress}: {progress: number}) {
  const target = Math.min(1, Math.max(0, progress));
  const animate = shouldAnimate(useReduceMotion());
  const value = useSharedValue(target);
  const width = useSharedValue(0);

  useEffect(() => {
    value.set(animate
      ? withTiming(target, {duration: PROGRESS_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System})
      : target);
  }, [target, animate, value]);

  const fillStyle = useAnimatedStyle(() => ({transform: [{scaleX: value.get()}]}));
  const headStyle = useAnimatedStyle(() => ({transform: [{translateX: value.get() * width.get()}]}));

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <Animated.View style={[styles.head, headStyle]}>
        <View style={styles.glow} />
        <View style={styles.dot} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {height: GLOW, justifyContent: 'center'},
  track: {height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {flex: 1, borderRadius: 2, backgroundColor: colors.accent, transformOrigin: 'left'},
  head: {
    position: 'absolute',
    left: -GLOW / 2,
    width: GLOW,
    height: GLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {position: 'absolute', width: GLOW, height: GLOW, borderRadius: GLOW / 2, backgroundColor: colors.accent, opacity: 0.3},
  dot: {width: HEAD, height: HEAD, borderRadius: HEAD / 2, backgroundColor: colors.accent},
});
