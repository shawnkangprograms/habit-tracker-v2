import {useEffect} from 'react';
import {View} from 'react-native';
import Svg, {Circle, Line, Polygon, Text as SvgText} from 'react-native-svg';
import Animated, {Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors, fonts} from '@/constants/theme';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {textWidth} from '@/utils/onboarding/layout';
import {RADAR_DATA_FROM_SCALE, RADAR_DATA_MS, shouldAnimate} from '@/utils/onboarding/motion';
import {LABEL_SIZE, polygonPoints, radarPoint} from '@/utils/onboarding/radar';
import {AXES} from '@/utils/onboarding/types';
import type {Outline} from '@/services/profileOutlineStoreCore';
import {axisLabelLines} from '@/utils/radar/copy';
import {fitRadarTwoLine} from '@/utils/radar/fit';
import {radarShape, type RadarWindow} from '@/utils/radar/score';

// The live radar (docs/PACKS_REPORTS_SPEC.md, section 11), in the onboarding radar's axis order (Learning at the top,
// then clockwise). Layers, each its own small Svg so only view opacity and transform ever animate:
// 1. grid: the outer hexagon and the spokes; an axis without a score has a DASHED spoke
// 2. the starting outline (full radar only, when one is stored): faint, dashed, behind the live shape
// 3. the live shape (orange, 25% fill) with a dot on every axis that has a score; axes without one sit at the
//    centre with no dot. It fades and grows from the centre once when it first appears; under reduce motion it is
//    simply there.
// 4. labels (full radar only): two lines, the area name, then "{n}%" or "–" (utils/radar/fit.ts). The words for
//    axes without a score are in the list below it.
// In the starting state (no axis has a score) only the grid is drawn. Hidden from screen readers: the caller's
// label carries every value in words.

const FULL = AXES.map(() => 1);
const WORST_LABELS = AXES.map((axis) => ({first: axis, second: '100%'}));// fit to the widest labels: the size never changes
const labelWidth = (text: string) => textWidth(text, LABEL_SIZE);
const SYSTEM = ReduceMotion.System;

type Geometry = {width: number; height: number; cx: number; cy: number; radius: number};

export const COMPACT_SIZE = 112;

export function RadarDrawing(props: {window: RadarWindow; width?: number; compact?: boolean; outline?: Outline | null}) {
  const {window: radar, compact} = props;
  const fit = compact ? null : fitRadarTwoLine(props.width ?? COMPACT_SIZE, WORST_LABELS, labelWidth);
  const g: Geometry = fit ?? {width: COMPACT_SIZE, height: COMPACT_SIZE, cx: COMPACT_SIZE / 2, cy: COMPACT_SIZE / 2, radius: COMPACT_SIZE / 2 - 6};
  const box = {width: g.width, height: g.height, alignSelf: 'center'} as const;
  const layer = {position: 'absolute', top: 0, left: 0, width: g.width, height: g.height} as const;
  const viewBox = `0 0 ${g.width} ${g.height}`;
  const shape = radarShape(radar);

  const animate = shouldAnimate(useReduceMotion());
  const shown = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    shown.set(animate ? withTiming(1, {duration: RADAR_DATA_MS, easing: Easing.out(Easing.cubic), reduceMotion: SYSTEM}) : 1);
  }, [animate, shown]);
  const dataStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{scale: RADAR_DATA_FROM_SCALE + (1 - RADAR_DATA_FROM_SCALE) * shown.get()}],
  }));

  return (
    <View style={box} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {/* 1. grid */}
      <View style={layer}>
        <Svg width={g.width} height={g.height} viewBox={viewBox}>
          {radar.axes.map((a, i) => {
            const end = radarPoint(i, AXES.length, 1, g.radius, g.cx, g.cy);
            const scored = a.state === 'score';
            return (
              <Line
                key={a.axis}
                x1={g.cx} y1={g.cy} x2={end.x} y2={end.y}
                stroke={scored ? colors.border : colors.muted}
                strokeWidth={1.5}
                strokeDasharray={scored ? undefined : '4 4'}
              />
            );
          })}
          <Polygon points={polygonPoints(FULL, g.radius, g.cx, g.cy)} fill="none" stroke={colors.border} strokeWidth={1.5} />
        </Svg>
      </View>

      {/* 2. the starting outline: Summary only */}
      {!compact && props.outline && (
        <View style={layer}>
          <Svg width={g.width} height={g.height} viewBox={viewBox}>
            <Polygon
              points={polygonPoints(AXES.map((axis) => props.outline![axis] / 5), g.radius, g.cx, g.cy)}
              fill="none"
              stroke={colors.muted}
              strokeOpacity={0.6}
              strokeWidth={1.5}
              strokeDasharray="2 4"
            />
          </Svg>
        </View>
      )}

      {/* 3. the live shape and its dots */}
      {!radar.starting && (
        <Animated.View style={[layer, dataStyle]}>
          <Svg width={g.width} height={g.height} viewBox={viewBox}>
            <Polygon
              points={polygonPoints(shape, g.radius, g.cx, g.cy)}
              fill={colors.accent}
              fillOpacity={0.25}
              stroke={colors.accent}
              strokeWidth={2}
            />
            {radar.axes.map((a, i) => {
              if (a.state !== 'score') return null;
              const p = radarPoint(i, AXES.length, a.share, g.radius, g.cx, g.cy);
              return <Circle key={a.axis} cx={p.x} cy={p.y} r={compact ? 3 : 3.5} fill={colors.accent} />;
            })}
          </Svg>
        </Animated.View>
      )}

      {/* 4. labels: full radar only */}
      {fit && (
        <View style={layer}>
          <Svg width={g.width} height={g.height} viewBox={viewBox}>
            {fit.labels.map((l, i) => {
              const lines = axisLabelLines(radar.axes[i]);
              return [
                <SvgText key={`${AXES[i]}-1`} x={l.x} y={l.firstY} textAnchor={l.anchor} fill={colors.text} fontSize={LABEL_SIZE} fontFamily={fonts.semiBold}>
                  {lines.first}
                </SvgText>,
                <SvgText key={`${AXES[i]}-2`} x={l.x} y={l.secondY} textAnchor={l.anchor} fill={colors.text} fontSize={LABEL_SIZE} fontFamily={fonts.semiBold}>
                  {lines.second}
                </SvgText>,
              ];
            })}
          </Svg>
        </View>
      )}
    </View>
  );
}
