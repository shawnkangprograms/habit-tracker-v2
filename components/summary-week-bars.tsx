import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {SummaryDay} from '@/utils/summary';
import {barCaption, barValue, dayLabel, shareStep} from '@/utils/summaryLabels';
import {OUTLINE, stepFill} from '@/components/summary-scale';

const BAR_W = 20;
const BAR_H = 96;
const RADIUS = 4;
const MIN_FILL = 4; // a day with something done never draws as an invisible sliver

// A bar rounded at the top only, anchored to the baseline
function topRoundedBar(height: number): string {
  const r = Math.min(RADIUS, height, BAR_W / 2);
  const y = BAR_H - height;
  return `M0,${BAR_H} V${y + r} Q0,${y} ${r},${y} H${BAR_W - r} Q${BAR_W},${y} ${BAR_W},${y + r} V${BAR_H} Z`;
}

// Last 7 days, one bar per day: height = share of scheduled habits done, filled in the same step colour as the
// heat strip. Scheduled days sit on a track; a day with none done gets a solid outline, a day with nothing
// scheduled a dashed one and no fill. Each column is one screen-reader element with the day in words.
export const WeekBars = memo(function WeekBars({days}: {days: SummaryDay[]}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {days.map((day) => {
          const step = shareStep(day);
          const fillHeight = day.done > 0 ? Math.max(MIN_FILL, (day.done / day.scheduled) * BAR_H) : 0;
          return (
            <View key={day.date} style={styles.column} accessible accessibilityLabel={dayLabel(day)}>
              <Svg width={BAR_W} height={BAR_H}>
                {step === 'none' ? (
                  <Rect x={0.5} y={0.5} width={BAR_W - 1} height={BAR_H - 1} rx={RADIUS}
                    fill="none" stroke={OUTLINE} strokeWidth={1} strokeDasharray="3 3" />
                ) : (
                  <Rect x={0.5} y={0.5} width={BAR_W - 1} height={BAR_H - 1} rx={RADIUS}
                    fill={colors.track} stroke={step === 0 ? OUTLINE : 'none'} strokeWidth={1} />
                )}
                {fillHeight > 0 && <Path d={topRoundedBar(fillHeight)} fill={stepFill(step)} />}
              </Svg>
              <Text style={[styles.caption, day.isToday && styles.today]}>{barCaption(day)}</Text>
              <Text style={styles.value}>{barValue(day)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {flexDirection: 'row', alignItems: 'flex-start'},
  column: {flex: 1, alignItems: 'center', gap: spacing.xs},
  caption: {fontFamily: fonts.medium, fontSize: 12, color: colors.muted, textAlign: 'center'},
  today: {fontFamily: fonts.bold, color: colors.text},
  value: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center'},
});
