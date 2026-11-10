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
      {/* each side: marker and label on line 1, "count · %" on line 2; left side aligned left, right side right */}
      <View style={styles.splitLabels}>
        <View style={styles.side}>
          <View style={styles.sideHead}>
            <View style={[styles.marker, styles.round, {backgroundColor: leftColor}]} />
            <Text style={styles.splitLabel} numberOfLines={1}>{split.left.label}</Text>
          </View>
          <Text style={styles.splitValue}>{split.left.count} · {split.left.percent}%</Text>
        </View>
        <View style={[styles.side, styles.sideRight]}>
          <View style={[styles.sideHead, styles.sideHeadRight]}>
            <View style={[styles.marker, {backgroundColor: rightColor}]} />
            <Text style={[styles.splitLabel, styles.right]} numberOfLines={1}>{split.right.label}</Text>
          </View>
          <Text style={[styles.splitValue, styles.right]}>{split.right.count} · {split.right.percent}%</Text>
        </View>
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
  side: {flex: 1, gap: 2, alignItems: 'flex-start'},
  sideRight: {alignItems: 'flex-end'},
  sideHead: {flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%'},
  sideHeadRight: {justifyContent: 'flex-end'},
  marker: {width: 9, height: 9, borderRadius: 2},// left: round, right: square, so shape tells the sides apart too
  round: {borderRadius: 4.5},
  splitLabel: {flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.text},
  right: {textAlign: 'right'},
  splitValue: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
});
