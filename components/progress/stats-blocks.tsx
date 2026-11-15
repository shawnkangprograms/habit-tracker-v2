import {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeInDown, ReduceMotion} from 'react-native-reanimated';
import type {AppStats} from '@/utils/appStats';
import {medalStates} from '@/utils/medals';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {LevelBadge, XpBar} from '@/components/stats-card';
import {Medal} from '@/components/medal';
import {
  LIFETIME_TITLE, LONGEST_STREAK_LABEL, MEDALS_TITLE, PERFECT_DAYS_LABEL, TOTAL_XP_LABEL, levelText, longestText, streakA11yLabel,
  streakText, tileA11yLabel,
} from '@/utils/copy/progress';

// The old Profile screen's blocks, moved here unchanged: the level and streak cards at the top of Progress, the medal
// shelf and the lifetime tiles at the bottom. Each shows only once stats have loaded.

export function LevelAndStreak({stats}: {stats: AppStats}) {
  return (
    <>
      <View style={[styles.card, styles.levelCard]}>
        <LevelBadge level={stats.level} size={56} />
        <View style={styles.levelMiddle}>
          <Text style={styles.levelText}>{levelText(stats.level)}</Text>
          <XpBar progress={stats.progress} xpIntoLevel={stats.xpIntoLevel} xpForNextLevel={stats.xpForNextLevel} />
        </View>
      </View>

      <View
        style={[styles.card, styles.streakCard]}
        accessible
        accessibilityLabel={streakA11yLabel(stats.currentStreak, stats.longestStreak)}>
        <MaterialCommunityIcons name="fire" size={40} color={colors.accent} />
        <View>
          <Text style={styles.streakText}>{streakText(stats.currentStreak)}</Text>
          <Text style={styles.muted}>{longestText(stats.longestStreak)}</Text>
        </View>
      </View>
    </>
  );
}

export function MedalsAndLifetime({stats}: {stats: AppStats}) {
  const medals = useMemo(() => medalStates(stats.longestStreak), [stats.longestStreak]);
  return (
    <>
      <Text style={styles.section}>{MEDALS_TITLE}</Text>
      <View style={[styles.card, styles.shelf]}>
        {medals.map((m, i) => (
          // appears once when the shelf first mounts (tabs stay mounted); instant under reduce motion
          <Animated.View
            key={m.days}
            style={styles.medalCell}
            entering={FadeInDown.duration(250).delay(i * 50).reduceMotion(ReduceMotion.System)}>
            <Medal days={m.days} tier={m.tier} earned={m.earned} daysToGo={m.daysToGo} />
          </Animated.View>
        ))}
      </View>

      <Text style={styles.section}>{LIFETIME_TITLE}</Text>
      <View style={styles.tiles}>
        <Tile value={stats.totalXp} label={TOTAL_XP_LABEL} />
        <Tile value={stats.longestStreak} label={LONGEST_STREAK_LABEL} />
        <Tile value={stats.perfectDays} label={PERFECT_DAYS_LABEL} />
      </View>
    </>
  );
}

function Tile({value, label}: {value: number; label: string}) {
  return (
    <View style={[styles.card, styles.tile]} accessible accessibilityLabel={tileA11yLabel(label, value)}>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

// Progress's section title (Medals, Lifetime, and Awards in components/progress/awards-section.tsx)
export const sectionTitleStyle = {fontFamily: fonts.title, fontSize: 18, color: colors.text, paddingTop: spacing.sm} as const;

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md},
  levelMiddle: {flex: 1, gap: 5},
  levelText: {fontFamily: fonts.title, fontSize: 16, color: colors.text},
  streakCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md},
  streakText: {fontFamily: fonts.title, fontSize: 20, color: colors.text},
  muted: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  section: sectionTitleStyle,
  shelf: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, paddingVertical: spacing.lg},
  medalCell: {width: '33.333%', alignItems: 'center'},
  tiles: {flexDirection: 'row', gap: spacing.sm},
  tile: {flex: 1, padding: spacing.md, gap: 2},
  tileValue: {fontFamily: fonts.title, fontSize: 22, color: colors.text},
  tileLabel: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
});
