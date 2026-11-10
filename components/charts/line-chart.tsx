import {memo, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Circle, Line, Path} from 'react-native-svg';
import {colors, fonts, spacing} from '@/constants/theme';
import {axisTicks, linePath, nearestPoint, pointX, valueY} from '@/components/charts/geometry';

export type LineSeries = {label: string; values: (number | null)[]; color: string; dashed?: boolean};

type Props = {
  series: LineSeries[];
  xLabels: string[];// axis text per point (first, middle and last are shown)
  pointLabels: string[];// tooltip heading per point, e.g. "Mon 9 Nov"
  max: number;// the y axis top (use niceMax)
  format?: (v: number) => string;
  accessibilityLabel: string;
};

const HEIGHT = 140;
const AXIS_W = 34;
const PAD_TOP = 6;

// A line chart in react-native-svg: one Path per series (gaps break the line), a dot for points that stand alone,
// three grid lines, and a legend naming each series with its line style (solid / dashed), so colour is never the
// only cue. Tapping picks the nearest day and shows every series' value for it above the chart.
export const LineChart = memo(function LineChart({series, xLabels, pointLabels, max, format = String, accessibilityLabel}: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const n = xLabels.length;
  const plotW = Math.max(width - AXIS_W, 0);
  const box = useMemo(() => ({width: plotW, height: HEIGHT}), [plotW]);
  const paths = useMemo(() => series.map((s) => linePath(s.values, max, box)), [series, max, box]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const pick = (x: number) => setSelected(nearestPoint(x - AXIS_W, n, plotW));

  const sel = selected !== null && selected < n ? selected : null;
  const tooltip = sel === null
    ? 'Tap the chart to see a day'
    : `${pointLabels[sel]} · ${series.map((s) => `${s.label} ${s.values[sel] === null ? 'no data' : format(s.values[sel]!)}`).join(' · ')}`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.tooltip} numberOfLines={2}>{tooltip}</Text>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => pick(e.nativeEvent.locationX)}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Tap to show a day's values above the chart">
        {/* children ignore touches, so locationX is always measured from the Pressable (Android reports it
            relative to the innermost view otherwise) */}
        <View pointerEvents="none">
        <View style={{height: HEIGHT + PAD_TOP}}>
          {[max, max / 2, 0].map((v) => (
            <Text key={v} style={[styles.axis, {top: PAD_TOP + valueY(v, max, HEIGHT) - 7}]}>{format(Math.round(v))}</Text>
          ))}
          {plotW > 0 && (
            <Svg width={plotW} height={HEIGHT + PAD_TOP} style={styles.svg}>
              {[max, max / 2, 0].map((v) => {
                const y = PAD_TOP + valueY(v, max, HEIGHT);
                return <Line key={v} x1={0} x2={plotW} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />;
              })}
              {sel !== null && (
                <Line x1={pointX(sel, n, plotW)} x2={pointX(sel, n, plotW)} y1={PAD_TOP} y2={PAD_TOP + HEIGHT}
                  stroke={colors.muted} strokeWidth={1} strokeDasharray="2 3" />
              )}
              {paths.map((p, i) => (
                <Path key={series[i].label} d={p.d} translateY={PAD_TOP} fill="none" stroke={series[i].color} strokeWidth={2}
                  strokeDasharray={series[i].dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {paths.flatMap((p, i) => p.dots.map((d) => (
                <Circle key={`${series[i].label}-${d.x}`} cx={d.x} cy={d.y + PAD_TOP} r={2.5} fill={series[i].color} />
              )))}
              {sel !== null && series.map((s) => (s.values[sel] === null ? null : (
                <Circle key={s.label} cx={pointX(sel, n, plotW)} cy={PAD_TOP + valueY(s.values[sel]!, max, HEIGHT)} r={4}
                  fill={colors.surface} stroke={s.color} strokeWidth={2} />
              )))}
            </Svg>
          )}
        </View>
        <View style={[styles.xAxis, {marginLeft: AXIS_W}]}>
          {plotW > 0 && axisTicks(n).map((i, k, all) => (
            <Text key={i} style={[styles.xLabel, {
              position: 'absolute',
              left: Math.min(Math.max(pointX(i, n, plotW) - 30, 0), plotW - 60),
              textAlign: k === 0 ? 'left' : k === all.length - 1 ? 'right' : 'center',
            }]}>{xLabels[i]}</Text>
          ))}
        </View>
        </View>
      </Pressable>
      {series.length > 1 && (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <Svg width={22} height={8}>
                <Line x1={1} x2={21} y1={4} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
              </Svg>
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  tooltip: {fontFamily: fonts.medium, fontSize: 13, color: colors.text, minHeight: 18},
  svg: {position: 'absolute', left: AXIS_W, top: 0},
  axis: {position: 'absolute', left: 0, width: AXIS_W - 6, textAlign: 'right', fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  xAxis: {height: 16, marginTop: 4},
  xLabel: {width: 60, fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  legend: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  legendText: {fontFamily: fonts.medium, fontSize: 12, color: colors.text},
});
