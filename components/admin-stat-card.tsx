import {useState, type ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {Split} from '@/utils/adminStats';

export const EMPTY_TEXT = 'No data for this range yet';

// One admin Stats card: title, optional subtitle, an info button that shows a short plain explanation under the
// title, then the chart, or the empty state.
export function StatCard({title, subtitle, info, empty, children}: {
  title: string;
  subtitle?: string;
  info: string;
  empty: boolean;
  children: ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <Pressable
          onPress={() => setShowInfo((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`About ${title}`}
          accessibilityState={{expanded: showInfo}}>
          <MaterialCommunityIcons name={showInfo ? 'information' : 'information-outline'} size={22} color={colors.muted} />
        </Pressable>
      </View>
      {showInfo && <Text style={styles.info}>{info}</Text>}
      {empty ? <Text style={styles.empty}>{EMPTY_TEXT}</Text> : children}
    </View>
  );
}

// Two counts as one bar split in two, with both labels, counts and percentages written out
export function SplitBar({title, split, leftColor, rightColor, accessibilityLabel}: {
  title: string;
  split: Split;
  leftColor: string;
  rightColor: string;
  accessibilityLabel: string;
}) {
  const total = split.left.count + split.right.count;
  return (
    <View style={styles.split} accessible accessibilityLabel={accessibilityLabel}>
      <Text style={styles.splitTitle}>{title}</Text>
      <View style={styles.track}>
        {total > 0 && split.left.count > 0 && <View style={{flex: split.left.count, backgroundColor: leftColor}} />}
        {total > 0 && split.left.count > 0 && split.right.count > 0 && <View style={styles.gap} />}
        {total > 0 && split.right.count > 0 && <View style={{flex: split.right.count, backgroundColor: rightColor}} />}
      </View>
      <View style={styles.splitLabels}>
        <Text style={styles.splitLabel} numberOfLines={2}>
          <Text style={[styles.dot, {color: leftColor}]}>● </Text>
          {split.left.label} <Text style={styles.splitValue}>{split.left.count} · {split.left.percent}%</Text>
        </Text>
        <Text style={[styles.splitLabel, styles.right]} numberOfLines={2}>
          {split.right.label} <Text style={styles.splitValue}>{split.right.count} · {split.right.percent}%</Text>
          <Text style={[styles.dot, {color: rightColor}]}> ■</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.largeCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  titles: {flex: 1, gap: 2},
  title: {fontFamily: fonts.title, fontSize: 17, color: colors.text},
  subtitle: {fontFamily: fonts.medium, fontSize: 12, color: colors.muted},
  info: {fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, paddingVertical: spacing.lg, textAlign: 'center'},
  split: {gap: 6},
  splitTitle: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.text},
  track: {flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.track},
  gap: {width: 2},
  splitLabels: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md},
  splitLabel: {flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.text},
  right: {textAlign: 'right'},
  splitValue: {fontFamily: fonts.regular, color: colors.muted},
  dot: {fontSize: 11},
});
