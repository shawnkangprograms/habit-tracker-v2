import {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';

const MAX_PARTICLES = 20;
const DURATION_MS = 900;

// A one-off burst of dots from the centre of its parent. Plain Views (no SVG, no shadows), at most 20,
// all driven by ONE shared value on the UI thread, transform and opacity only. Positions are fixed
// (evenly spaced angles), not random. Callers don't render it at all under Reduce Motion.
export function Burst({colors, count = 16, radius = 120}: {colors: string[]; count?: number; radius?: number}) {
  const progress = useSharedValue(0);
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(count)));

  useEffect(() => {
    progress.value = withTiming(1, {duration: DURATION_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System});
  }, [progress]);

  return (
    <View style={styles.center} pointerEvents="none">
      {Array.from({length: n}, (_, i) => (
        <Particle
          key={i}
          progress={progress}
          angle={(2 * Math.PI * i) / n}
          distance={radius * (i % 2 === 0 ? 1 : 0.7)}
          size={i % 3 === 0 ? 10 : 7}
          color={colors[i % colors.length]}
        />
      ))}
    </View>
  );
}

function Particle(props: {progress: SharedValue<number>; angle: number; distance: number; size: number; color: string}) {
  const {progress, angle, distance, size} = props;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      {translateX: dx * progress.value},
      {translateY: dy * progress.value},
      {scale: 1 - 0.5 * progress.value},
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: props.color},
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: {position: 'absolute', left: '50%', top: '50%', width: 0, height: 0},
  particle: {position: 'absolute', left: 0, top: 0},
});
