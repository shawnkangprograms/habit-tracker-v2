import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {HabitIcon} from '@/constants/habitIcons';
import {ICON_IDS, type IconId} from '@/constants/habits';
import type {HabitRate} from '@/utils/summary';
import {habitDetail, habitLabel, rateText} from '@/utils/summaryLabels';

const isIconId = (icon: string): icon is IconId => (ICON_IDS as readonly string[]).includes(icon);

// Each active habit's rate for the range, already sorted (utils/summary.ts). Icons are muted, not in their
// Home colours, so no green or pink next to a rate reads as a status. One screen-reader element per row.
export const HabitRateList = memo(function HabitRateList({habits}: {habits: HabitRate[]}) {
  return (
    <View style={styles.card}>
      {habits.map((h, i) => (
        <View
          key={h.habitId}
          style={[styles.row, i > 0 && styles.divider]}
          accessible
          accessibilityLabel={habitLabel(h)}>
          <View style={styles.badge}>
            {isIconId(h.icon) && <HabitIcon id={h.icon} size={20} color={colors.muted} />}
          </View>
          <View style={styles.middle}>
            <Text style={styles.name}>{h.habitName}</Text>
            <Text style={styles.detail}>{habitDetail(h)}</Text>
            {h.best && (
              <View style={styles.best}>
                <MaterialCommunityIcons name="star" size={14} color={colors.accent} />
                <Text style={styles.bestText}>Best this range</Text>
              </View>
            )}
          </View>
          <Text style={styles.rate}>{rateText(h.rate)}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.md},
  divider: {borderTopWidth: 1, borderTopColor: colors.border},
  badge: {
    width: 36,
    height: 36,
    borderRadius: radii.iconBadge,
    backgroundColor: colors.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {flex: 1, gap: 2},
  name: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  detail: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accent + '26', // ~15%, like the level badge; text stays in text ink
  },
  bestText: {fontFamily: fonts.medium, fontSize: 12, color: colors.text},
  rate: {fontFamily: fonts.title, fontSize: 18, color: colors.text},
});
