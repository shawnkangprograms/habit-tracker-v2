import {StyleSheet, Text} from 'react-native';
import {useProgressStats} from '@/hooks/use-progress-stats';
import {colors, fonts, spacing} from '@/constants/theme';
import {Screen} from '@/components/ui/screen';
import {LevelAndStreak, MedalsAndLifetime} from '@/components/progress/stats-blocks';
import {SummarySection} from '@/components/progress/summary-section';
import {AwardsSection} from '@/components/progress/awards-section';
import {PROGRESS_TITLE, STATS_FAILED_LINE} from '@/utils/copy/progress';

// Progress (C2, Set 2): the old Summary and Profile screens as one. Top to bottom: the title; the level and streak
// cards; the Week/Month toggle, the stats, the last 7 or 30 days, the radar (its title, Strongest and Needs-care, the
// drawing and its rows) and the per-habit list (the summary, utils/summary.ts); then the medals and the lifetime
// tiles. The two halves load on their own (the stats from the store Home shares, the summary from local rows on
// focus), so one failing never hides the other, and each keeps its own quiet failure line.
export default function ProgressScreen() {
  const {stats, failed} = useProgressStats();

  return (
    <Screen padding={spacing.lg} gap={spacing.s10} contentStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">{PROGRESS_TITLE}</Text>

      {!stats && failed && <Text style={styles.empty}>{STATS_FAILED_LINE}</Text>}

      {stats && <LevelAndStreak stats={stats} />}
      <SummarySection />
      {stats && <MedalsAndLifetime stats={stats} />}
      {stats && <AwardsSection awards={stats.awards} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.s18},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, paddingTop: spacing.s5},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
});
