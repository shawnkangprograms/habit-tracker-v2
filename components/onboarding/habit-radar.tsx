import {useEffect} from 'react';
import {useWindowDimensions, View} from 'react-native';
import Svg, {Line, Polygon, Text as SvgText} from 'react-native-svg';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import {colors, fonts} from '@/constants/theme';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {SCREEN_PADDING, textWidth} from '@/utils/onboarding/layout';
import {LABEL_SIZE, fitRadar, polygonPoints, radarPoint} from '@/utils/onboarding/radar';
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
//
// Size: the drawing area is the full content width, and fitRadar (utils/onboarding/radar.ts) picks the largest
// radius that keeps every label inside it, from a conservative estimate of each label's width
// (tests/onboarding-layout.test.ts checks screen widths 300 to 430).

const FULL = AXES.map(() => 1);
const BASELINE = AXES.map(() => RADAR_BASELINE / AXIS_MAX);
const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting
const labelWidth = (text: string) => textWidth(text, LABEL_SIZE);

export function HabitRadar({scores}: {scores: Scores}) {
  const {width: screenWidth} = useWindowDimensions();
  const fit = fitRadar(screenWidth - 2 * SCREEN_PADDING, AXES, labelWidth);
  const {width, height, cx, cy, radius} = fit;
  const box = {width, height, alignSelf: 'center'} as const;
  const layer = {position: 'absolute', top: 0, left: 0, width, height} as const;
  const viewBox = `0 0 ${width} ${height}`;
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
    <View style={box} accessible accessibilityRole="image" accessibilityLabel={label}>
      {/* 1. grid: axis lines and the outer hexagon (static) */}
      <View style={layer}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {AXES.map((axis, i) => {
            const end = radarPoint(i, AXES.length, 1, radius, cx, cy);
            return <Line key={axis} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={colors.border} strokeWidth={1} />;
          })}
          <Polygon points={polygonPoints(FULL, radius, cx, cy)} fill="none" stroke={colors.border} strokeWidth={1.5} />
        </Svg>
      </View>

      {/* 2. the 2/5 baseline */}
      <Animated.View style={[layer, baselineStyle]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          <Polygon points={polygonPoints(BASELINE, radius, cx, cy)} fill="none" stroke={colors.muted} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>
      </Animated.View>

      {/* 3. the scores */}
      <Animated.View style={[layer, dataStyle]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          <Polygon
            points={polygonPoints(radarValues(scores), radius, cx, cy)}
            fill={colors.accent}
            fillOpacity={0.25}
            stroke={colors.accent}
            strokeWidth={2}
          />
        </Svg>
      </Animated.View>

      {/* 4. axis labels */}
      <Animated.View style={[layer, labelsStyle]}>
        <Svg width={width} height={height} viewBox={viewBox}>
          {fit.labels.map((l) => (
            <SvgText key={l.text} x={l.x} y={l.y} textAnchor={l.anchor} fill={colors.muted} fontSize={LABEL_SIZE} fontFamily={fonts.semiBold}>
              {l.text}
            </SvgText>
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
