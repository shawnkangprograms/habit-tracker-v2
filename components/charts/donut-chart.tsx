import {memo, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {colors, fonts, spacing} from '@/constants/theme';
import {donutArcs, sliceAt} from '@/components/charts/geometry';
import {plural} from '@/utils/adminStats';

export type DonutSlice = {key: string; label: string; count: number; percent: number; color: string};

type Props = {
  slices: DonutSlice[];
  totalLabel: string;// under the total in the middle, e.g. "habits"
  accessibilityLabel: string;
};

const SIZE = 148;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2 - 3;// room for the thicker selected ring
const CIRC = 2 * Math.PI * RADIUS;

// A donut in react-native-svg: one Circle per non-empty slice (stroke dashes), starting at 12 o'clock. The legend
// lists every slice, empty ones too, with its count and percentage, so colour is never the only cue. Tapping a
// slice or a legend row selects it: the slice thickens, the middle shows its share, the row is bold.
export const DonutChart = memo(function DonutChart({slices, totalLabel, accessibilityLabel}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const counts = useMemo(() => slices.map((s) => s.count), [slices]);
  const arcs = useMemo(() => donutArcs(counts), [counts]);
  const total = counts.reduce((sum, c) => sum + c, 0);
  const sel = slices.find((s) => s.key === selected) ?? null;
  const toggle = (key: string) => setSelected((cur) => (cur === key ? null : key));

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={(e) => {
          const i = sliceAt(arcs, e.nativeEvent.locationX, e.nativeEvent.locationY, SIZE / 2, SIZE / 2,
            RADIUS - STROKE / 2 - 4, RADIUS + STROKE / 2 + 4);
          if (i !== null) toggle(slices[i].key);
        }}
        style={styles.donut}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="The legend lists every area; tap a row to highlight it">
        <View pointerEvents="none">{/* locationX/Y measured from the Pressable (see line-chart.tsx) */}
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={colors.track} strokeWidth={STROKE} />
            {arcs.map((a) => {
              const s = slices[a.index];
              const isSel = s.key === selected;
              // a 1-unit gap between slices, unless the slice is the whole ring
              const len = Math.max(a.length * CIRC - (a.length < 1 ? 1.5 : 0), 0.5);
              return (
                <Circle key={s.key} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={s.color}
                  strokeWidth={isSel ? STROKE + 6 : STROKE} strokeDasharray={`${len} ${CIRC - len}`}
                  strokeDashoffset={-a.start * CIRC} rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}
                  opacity={selected === null || isSel ? 1 : 0.45} />
              );
            })}
          </Svg>
          <View style={styles.center}>
            <Text style={styles.centerValue}>{sel ? `${sel.percent}%` : total}</Text>
            <Text style={styles.centerLabel} numberOfLines={1}>{sel ? sel.label : totalLabel}</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.legend}>
        {slices.map((s) => {
          const isSel = s.key === selected;
          return (
            <Pressable key={s.key} onPress={() => toggle(s.key)} style={styles.row} hitSlop={4}
              accessibilityRole="button" accessibilityState={{selected: isSel}}
              accessibilityLabel={`${s.label}: ${plural(s.count, 'habit', 'habits')}, ${s.percent} percent`}>
              <View style={[styles.swatch, {backgroundColor: s.color}]} />
              <Text style={[styles.rowLabel, isSel && styles.bold]} numberOfLines={1}>{s.label}</Text>
              <Text style={[styles.rowValue, isSel && styles.bold]}>{s.count}</Text>
              <Text style={styles.rowPercent}>{s.percent}%</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {gap: spacing.lg, alignItems: 'stretch'},
  donut: {alignSelf: 'center', width: SIZE, height: SIZE},
  center: {position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center'},
  centerValue: {fontFamily: fonts.title, fontSize: 26, color: colors.text},
  centerLabel: {fontFamily: fonts.medium, fontSize: 12, color: colors.muted, maxWidth: SIZE - 2 * STROKE - 12},
  legend: {gap: 2},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32},
  swatch: {width: 12, height: 12, borderRadius: 3},
  rowLabel: {flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text},
  rowValue: {minWidth: 32, textAlign: 'right', fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
  rowPercent: {minWidth: 44, textAlign: 'right', fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  bold: {fontFamily: fonts.bold},
});
