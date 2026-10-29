import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {SummaryDay} from '@/utils/summary';
import {dayLabel, shareStep, type ShareStep} from '@/utils/summaryLabels';
import {OUTLINE, stepFill} from '@/components/summary-scale';

const COLUMNS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday first
const HIDDEN = {accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants'} as const;

type Slot = {kind: 'day'; day: SummaryDay} | {kind: 'blank'; key: string};

function cellStyle(step: ShareStep) {
  if (step === 'none') return styles.none;
  if (step === 0) return styles.zero;
  return {backgroundColor: stepFill(step)};
}

// Last 30 days as a Monday-first 7-column grid: leading blanks line the first day up with its weekday, and
// the last row is padded so every cell keeps the same width. Blanks and the weekday header are hidden from
// screen readers; each day is one element with its date in words.
export const HeatStrip = memo(function HeatStrip({days, leadingBlanks}: {days: SummaryDay[]; leadingBlanks: number}) {
  const slots: Slot[] = [
    ...Array.from({length: leadingBlanks}, (_, i): Slot => ({kind: 'blank', key: `lead-${i}`})),
    ...days.map((day): Slot => ({kind: 'day', day})),
  ];
  while (slots.length % 7 !== 0) slots.push({kind: 'blank', key: `tail-${slots.length}`});
  const rows = Array.from({length: slots.length / 7}, (_, r) => slots.slice(r * 7, r * 7 + 7));

  return (
    <View style={styles.card}>
      <View style={styles.row} {...HIDDEN}>
        {COLUMNS.map((c, i) => (
          <Text key={i} style={styles.header}>{c}</Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((slot) => slot.kind === 'blank' ? (
            <View key={slot.key} style={styles.slot} {...HIDDEN} />
          ) : (
            <View key={slot.day.date} style={styles.slot} accessible accessibilityLabel={dayLabel(slot.day, true)}>
              <View style={[styles.cell, cellStyle(shareStep(slot.day)), slot.day.isToday && styles.today]} />
            </View>
          ))}
        </View>
      ))}
      <Legend />
    </View>
  );
});

// Visual key only; every cell already says its value in words
function Legend() {
  return (
    <View style={styles.legend} {...HIDDEN}>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.none]} />
        <Text style={styles.legendText}>Nothing scheduled</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, styles.zero]} />
        <Text style={styles.legendText}>None done</Text>
      </View>
      <View style={styles.legendItem}>
        <Text style={styles.legendText}>Some</Text>
        {([1, 2, 3, 4] as const).map((s) => <View key={s} style={[styles.swatch, {backgroundColor: stepFill(s)}]} />)}
        <Text style={styles.legendText}>All done</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {flexDirection: 'row'},
  header: {flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.muted, textAlign: 'center'},
  slot: {flex: 1, padding: 2},
  cell: {aspectRatio: 1, borderRadius: 4}, // radius also lets Android draw the dashed border
  none: {borderWidth: 1, borderStyle: 'dashed', borderColor: OUTLINE},
  zero: {backgroundColor: colors.track, borderWidth: 1, borderColor: OUTLINE},
  today: {borderWidth: 2, borderStyle: 'solid', borderColor: colors.text},
  legend: {flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs, paddingTop: spacing.sm},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  swatch: {width: 14, height: 14, borderRadius: 3},
  legendText: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
});
