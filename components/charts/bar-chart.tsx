import {memo, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Line, Path, Rect} from 'react-native-svg';
import {colors, fonts, spacing} from '@/constants/theme';
import {axisTicks, barSlot, barsPath, slotAt, valueY} from '@/components/charts/geometry';

type Props = {
  values: (number | null)[];// null: no data, no bar
  xLabels: string[];// axis text per bar (first, middle and last are shown)
  barLabels: string[];// tooltip heading per bar, e.g. "Mon 9 Nov" or "Week of 2 Nov"
  max: number;// the y axis top (use niceMax)
  color: string;
  valueName: string;// tooltip noun, e.g. "sign-ups"
  accessibilityLabel: string;
};

const HEIGHT = 120;
const AXIS_W = 34;
const PAD_TOP = 6;

// A bar chart in react-native-svg. Every bar is one shared Path (one native view, light on low-end phones); the
// tapped bar is outlined and its value shown in words above the chart. Days without data have no bar.
export const BarChart = memo(function BarChart({values, xLabels, barLabels, max, color, valueName, accessibilityLabel}: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const n = values.length;
  const plotW = Math.max(width - AXIS_W, 0);
  const d = useMemo(() => barsPath(values, max, {width: plotW, height: HEIGHT}), [values, max, plotW]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const sel = selected !== null && selected < n ? selected : null;
  const selValue = sel === null ? null : values[sel];
  const tooltip = sel === null
    ? 'Tap a bar to see its value'
    : `${barLabels[sel]} · ${selValue === null ? 'no data' : `${selValue} ${valueName}`}`;

  const slot = sel === null ? null : barSlot(sel, n, plotW);
  const selTop = selValue === null || selValue === undefined ? null : PAD_TOP + valueY(selValue, max, HEIGHT);

  return (
    <View style={styles.wrap}>
      <Text style={styles.tooltip} numberOfLines={2}>{tooltip}</Text>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => setSelected(slotAt(e.nativeEvent.locationX - AXIS_W, n, plotW))}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Tap to show a bar's value above the chart">
        <View pointerEvents="none">{/* locationX measured from the Pressable (see line-chart.tsx) */}
          <View style={{height: HEIGHT + PAD_TOP}}>
            {[max, max / 2, 0].map((v) => (
              <Text key={v} style={[styles.axis, {top: PAD_TOP + valueY(v, max, HEIGHT) - 7}]}>{Math.round(v)}</Text>
            ))}
            {plotW > 0 && (
              <Svg width={plotW} height={HEIGHT + PAD_TOP} style={styles.svg}>
                {[max, max / 2, 0].map((v) => {
                  const y = PAD_TOP + valueY(v, max, HEIGHT);
                  return <Line key={v} x1={0} x2={plotW} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />;
                })}
                {d.length > 0 && <Path d={d} translateY={PAD_TOP} fill={color} />}
                {slot && (
                  <Rect x={slot.x - 1.5} y={selTop === null ? PAD_TOP : selTop - 1.5} width={slot.w + 3}
                    height={selTop === null ? HEIGHT : PAD_TOP + HEIGHT - selTop + 1.5}
                    fill="none" stroke={colors.text} strokeWidth={1.5} strokeDasharray={selTop === null ? '2 3' : undefined} />
                )}
              </Svg>
            )}
          </View>
          <View style={[styles.xAxis, {marginLeft: AXIS_W}]}>
            {plotW > 0 && axisTicks(n).map((i, k, all) => (
              <Text key={i} style={[styles.xLabel, {
                left: Math.min(Math.max(barSlot(i, n, plotW).center - 30, 0), plotW - 60),
                textAlign: k === 0 ? 'left' : k === all.length - 1 ? 'right' : 'center',
              }]}>{xLabels[i]}</Text>
            ))}
          </View>
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  tooltip: {fontFamily: fonts.medium, fontSize: 13, color: colors.text, minHeight: 18},
  svg: {position: 'absolute', left: AXIS_W, top: 0},
  axis: {position: 'absolute', left: 0, width: AXIS_W - 6, textAlign: 'right', fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  xAxis: {height: 16, marginTop: 4},
  xLabel: {position: 'absolute', width: 60, fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
});
