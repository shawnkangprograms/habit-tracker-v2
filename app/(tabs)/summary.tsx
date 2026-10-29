import {useCallback, useMemo, useRef, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ScrollView, StyleSheet, Text} from 'react-native';
import {getSummaryRows} from '@/db/gamification';// three local reads, one per table; never touches sync
import {useSessionUid} from '@/services/session';
import {getLocalDateString} from '@/utils/dates';
import {isDeepEqual} from '@/utils/equality';
import type {GamiCompletion} from '@/utils/gamification';
import {computeSummary, type SummaryHabit, type SummaryRange} from '@/utils/summary';
import {colors, fonts, spacing} from '@/constants/theme';
import {RangeToggle} from '@/components/summary-range-toggle';
import {SummaryStats} from '@/components/summary-stats';
import {WeekBars} from '@/components/summary-week-bars';
import {HeatStrip} from '@/components/summary-heat-strip';
import {HabitRateList} from '@/components/summary-habit-list';
import {SummaryEmptyCard} from '@/components/summary-empty-card';

type Loaded = {userId: string; today: string; habits: SummaryHabit[]; completions: GamiCompletion[]};

// Read-only progress summary, derived from local SQLite rows (utils/summary.ts). Works offline.
// Refreshes on focus only: no sync trigger and no remote- or local-change listener (known limitation: a change
// that lands while the tab is open shows on the next visit).
export default function SummaryScreen() {
  const userId = useSessionUid() ?? undefined;// this screen is only reachable while signed in (presumed or confirmed)
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);// the last load failed and nothing is shown: one quiet line
  const [range, setRange] = useState<SummaryRange>('week');
  const loadSeq = useRef(0);// only the latest load may set state

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++loadSeq.current;
    try {
      const today = getLocalDateString();
      const rows = await getSummaryRows(userId) as {habits: SummaryHabit[]; completions: GamiCompletion[]};
      if (seq !== loadSeq.current) return;
      const next: Loaded = {userId, today, ...rows};
      // same rows and day as last time: keep the old object, so nothing is recomputed or re-rendered
      setLoaded((prev) => (prev && isDeepEqual(prev, next) ? prev : next));
      setFailed(false);
    } catch (err) {
      console.log('Summary load failed', err);
      if (seq === loadSeq.current) setFailed(true);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  // Both ranges at once, once per load: switching Week/Month only picks one
  const visible = loaded && loaded.userId === userId ? loaded : null;// never another account's rows
  const summary = useMemo(
    () => (visible ? computeSummary(visible.habits, visible.completions, visible.today) : null),
    [visible],
  );
  const current = summary ? summary[range] : null;
  const createHabit = useCallback(() => router.push('/habit-form'), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">Summary.</Text>

        {!summary && failed && (
          <Text style={styles.empty}>Your summary couldn&apos;t be loaded. It&apos;ll try again next time you open this tab.</Text>
        )}

        {summary && current && (summary.month.empty === 'noHabits' ? (
          <SummaryEmptyCard kind="noHabits" onCreate={createHabit} />
        ) : (
          <>
            <RangeToggle value={range} onChange={setRange} />
            {current.empty ? (
              <SummaryEmptyCard kind="nothingScheduled" onCreate={createHabit} />
            ) : (
              <>
                <SummaryStats range={current} currentStreak={summary.currentStreak} />
                <Text style={styles.section} accessibilityRole="header">
                  {range === 'week' ? 'Last 7 days' : 'Last 30 days'}
                </Text>
                {range === 'week'
                  ? <WeekBars days={current.days} />
                  : <HeatStrip days={current.days} leadingBlanks={current.leadingBlanks} />}
                <Text style={styles.section} accessibilityRole="header">By habit</Text>
                <HabitRateList habits={current.habits} />
              </>
            )}
          </>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// Profile's layout rhythm: same padding, gap, title and section styles
const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: 18, gap: 10},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, paddingTop: 5},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  section: {fontFamily: fonts.title, fontSize: 18, color: colors.text, paddingTop: spacing.sm},
});
