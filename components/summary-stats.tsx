import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {RangeSummary} from '@/utils/summary';
import {daysText, rangeWords, rateText} from '@/utils/summaryLabels';

// The four header numbers for the selected range, two per row so they keep room at large text sizes.
// The streak is the overall one (same as Profile); the others follow the range.
export const SummaryStats = memo(function SummaryStats({range, currentStreak}: {
  range: RangeSummary;
  currentStreak: number;
}) {
  const words = rangeWords(range.range);
  const rate = rateText(range.rate);
  return (
    <View style={styles.grid}>
      <Stat value={String(range.done)} label="Check-ins done" spoken={`${range.done} check-ins done ${words}`} />
      <Stat value={rate} label="Completion rate"
        spoken={range.rate === null ? 'Completion rate: nothing finished yet' : `Completion rate ${rate} ${words}`} />
      <Stat value={String(range.perfectDays)} label="Perfect days"
        spoken={`${daysText(range.perfectDays)} with every habit done ${words}`} />
      <Stat value={String(currentStreak)} label="Day streak" spoken={`Current streak ${daysText(currentStreak)}`} />
    </View>
  );
});

function Stat({value, label, spoken}: {value: string; label: string; spoken: string}) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={spoken}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.md,
    gap: 2,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  value: {fontFamily: fonts.title, fontSize: 22, color: colors.text},
  label: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
});
