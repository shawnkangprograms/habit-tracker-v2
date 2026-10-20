import {useEffect, useRef} from 'react';
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors, fonts} from '@/constants/theme';

const DURATION_MS = 900;

// "+N XP" that floats up and fades out, then calls onDone so the parent can remove it.
// The parent only renders this when reduce motion is off.
export function XpFloat(props: {amount: number; onDone: () => void}) {
  const t = useSharedValue(0);
  // latest onDone in a ref, so a parent re-render (new arrow fxn) doesn't restart the animation
  const onDoneRef = useRef(props.onDone);
  useEffect(() => {
    onDoneRef.current = props.onDone;
  });

  useEffect(() => {
    t.value = withTiming(1, {duration: DURATION_MS});
    // a JS timer, so no callback from the UI thread is needed
    const timer = setTimeout(() => onDoneRef.current(), DURATION_MS + 50);
    return () => clearTimeout(timer);
  }, [t]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{translateY: -24 * t.value}],
  }));

  return (
    <Animated.Text
      style={[styles.label, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no">
      +{props.amount} XP
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    right: 8,
    top: 2,
    fontFamily: fonts.title,
    fontSize: 13,
    color: colors.accent,
  },
});
