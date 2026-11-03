import {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Line, Polygon, Text as SvgText} from 'react-native-svg';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import {colors, fonts} from '@/constants/theme';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {polygonPoints, radarPoint} from '@/utils/onboarding/radar';
import {
  RADAR_BASELINE_MS, RADAR_DATA_DELAY_MS, RADAR_DATA_FROM_SCALE, RADAR_DATA_MS, RADAR_LABELS_DELAY_MS, RADAR_LABELS_MS,
  shouldAnimate,
} from '@/utils/onboarding/motion';
import {AXIS_MAX, RADAR_BASELINE, radarValues, type Scores} from '@/utils/onboarding/scoring';
import {AXES} from '@/utils/onboarding/types';

// The Habit Profile radar: six axes in the Figma order (Learning at the top, then clockwise), the user's scores
// as a filled polygon, and the fixed 2/5 baseline as a dashed one.
//
// Motion (stage 4): four stacked layers, each its own small Svg in an Animated.View, so only view transforms
// and opacity animate and no SVG points string ever changes: the grid is static, the baseline fades in first,
// then the score polygon grows out from the centre (a view scales about its own centre, which is the radar's),
// then the labels fade in. Under reduced motion every layer is simply there. The radar reads the setting itself
// (its parent takes no motion prop); the hook reads false for its first moment, which the ReduceMotion.System
// backstop on every animation covers, and the effect then re-runs and shows every layer at once.

const SIZE = 280;
const C = SIZE / 2;
const RADIUS = 92;
const LABEL_GAP = 20;
const FULL = AXES.map(() => 1);
const BASELINE = AXES.map(() => RADAR_BASELINE / AXIS_MAX);
const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting

export function HabitRadar({scores}: {scores: Scores}) {
  const animate = shouldAnimate(useReduceMotion());
  const baseline = useSharedValue(animate ? 0 : 1);
  const data = useSharedValue(animate ? 0 : 1);// 0..1: opacity, and scale from RADAR_DATA_FROM_SCALE to 1
  const labels = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      baseline.set(1);
      data.set(1);
      labels.set(1);
      return;
    }
    baseline.set(withTiming(1, {duration: RADAR_BASELINE_MS, reduceMotion: SYSTEM}));
    data.set(withDelay(RADAR_DATA_DELAY_MS,
      withTiming(1, {duration: RADAR_DATA_MS, easing: Easing.out(Easing.cubic), reduceMotion: SYSTEM}), SYSTEM));
    labels.set(withDelay(RADAR_LABELS_DELAY_MS, withTiming(1, {duration: RADAR_LABELS_MS, reduceMotion: SYSTEM}), SYSTEM));
  }, [animate, baseline, data, labels]);

  const baselineStyle = useAnimatedStyle(() => ({opacity: baseline.get()}));
  const dataStyle = useAnimatedStyle(() => ({
    opacity: data.get(),
    transform: [{scale: RADAR_DATA_FROM_SCALE + (1 - RADAR_DATA_FROM_SCALE) * data.get()}],
  }));
  const labelsStyle = useAnimatedStyle(() => ({opacity: labels.get()}));

  const label = AXES.map((axis) => `${axis} ${scores[axis]} of ${AXIS_MAX}`).join(', ');
  return (
    <View style={styles.box} accessible accessibilityRole="image" accessibilityLabel={label}>
      {/* 1. grid: axis lines and the outer hexagon (static) */}
      <View style={styles.layer}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {AXES.map((axis, i) => {
            const end = radarPoint(i, AXES.length, 1, RADIUS, C, C);
            return <Line key={axis} x1={C} y1={C} x2={end.x} y2={end.y} stroke={colors.border} strokeWidth={1} />;
          })}
          <Polygon points={polygonPoints(FULL, RADIUS, C, C)} fill="none" stroke={colors.border} strokeWidth={1.5} />
        </Svg>
      </View>

      {/* 2. the 2/5 baseline */}
      <Animated.View style={[styles.layer, baselineStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Polygon points={polygonPoints(BASELINE, RADIUS, C, C)} fill="none" stroke={colors.muted} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>
      </Animated.View>

      {/* 3. the scores */}
      <Animated.View style={[styles.layer, dataStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Polygon
            points={polygonPoints(radarValues(scores), RADIUS, C, C)}
            fill={colors.accent}
            fillOpacity={0.25}
            stroke={colors.accent}
            strokeWidth={2}
          />
        </Svg>
      </Animated.View>

      {/* 4. axis labels */}
      <Animated.View style={[styles.layer, labelsStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {AXES.map((axis, i) => {
            const p = radarPoint(i, AXES.length, 1, RADIUS + LABEL_GAP, C, C);
            const anchor = Math.abs(p.x - C) < 1 ? 'middle' : p.x < C ? 'end' : 'start';
            const dy = p.y < C - 1 ? -2 : p.y > C + 1 ? 10 : 4;// keep top and bottom labels clear of the shape
            return (
              <SvgText key={axis} x={p.x} y={p.y + dy} textAnchor={anchor} fill={colors.muted} fontSize={12} fontFamily={fonts.semiBold}>
                {axis}
              </SvgText>
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {width: SIZE, height: SIZE, alignSelf: 'center'},
  layer: {position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE},
});
