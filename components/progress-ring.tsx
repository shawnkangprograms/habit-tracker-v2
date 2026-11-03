import {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import Animated, {ReduceMotion, useAnimatedProps, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors} from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Circular progress (0..1) that animates to new values. Under the system reduce-motion setting it jumps instead.
// durationMs: how long each change animates (Home uses the default; onboarding's Building Profile matches its
// 100 ms counter step so the ring keeps up with the number).
export function ProgressRing(props: {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  durationMs?: number;
  children?: React.ReactNode; // centred label
}) {
  const {size, strokeWidth, color, durationMs = 400} = props;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.min(1, Math.max(0, props.progress));
  const progress = useSharedValue(target);

  useEffect(() => {
    progress.value = withTiming(target, {duration: durationMs, reduceMotion: ReduceMotion.System});
  }, [target, progress, durationMs]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{width: size, height: size}}>
      {/* rotated so the arc starts at 12 o'clock */}
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.rotated}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.track} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={arcProps}
          fill="none"
        />
      </Svg>
      <View style={styles.center}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  rotated: {transform: [{rotate: '-90deg'}]},
  center: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center'},
});
