import {StyleSheet, Text, View, type ColorValue} from 'react-native';
import {IconSymbol} from '@/components/ui/icon-symbol';
import {useStatsEntry} from '@/hooks/use-stats';
import {streakIconLabel} from '@/utils/medals';
import {colors, fonts, radii} from '@/constants/theme';

const ICON_SIZE = 28;

// Profile tab icon: a flame with the current streak on it. Reads the shared stats store only (never loads),
// so a published change re-renders just this icon, not the tab bar. No number until stats have loaded.
export function StreakTabIcon({color}: {color: ColorValue}) {
  const entry = useStatsEntry();
  const label = entry ? streakIconLabel(entry.stats.currentStreak) : null;

  return (
    <View style={styles.box}>
      <IconSymbol size={ICON_SIZE} name="flame.fill" color={color} />
      {label !== null && (
        // a solid pill on the lower flame: readable on both the SF Symbol and the Material glyph (which has a hollow centre)
        <View style={styles.pillRow} pointerEvents="none">
          <View style={[styles.pill, {backgroundColor: color}]}>
            <Text
              style={[styles.number, label.length > 2 && styles.numberSmall]}
              numberOfLines={1}
              allowFontScaling={false}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {width: ICON_SIZE, height: ICON_SIZE},
  pillRow: {position: 'absolute', left: -2, right: -2, bottom: -1, alignItems: 'center'},
  pill: {
    minWidth: 14,
    maxWidth: ICON_SIZE + 4,
    height: 13,
    paddingHorizontal: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surface, // separates the pill from the flame, matches the tab bar
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {fontFamily: fonts.bold, fontSize: 10, lineHeight: 11, color: colors.background, includeFontPadding: false},
  numberSmall: {fontSize: 8, lineHeight: 10},
});
