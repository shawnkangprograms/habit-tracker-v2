import {useCallback, useMemo, useRef, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {StyleSheet, Text} from 'react-native';
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
import {RadarSummary} from '@/components/radar/radar-summary';
import {RadarHighlights} from '@/components/radar/radar-highlights';
import {setRadarWindow, useRadarWindow} from '@/hooks/use-radar-window';
import {areasStore} from '@/services/areasStore';
import {packsStore} from '@/services/packsStore';
import {profileOutlineStore} from '@/services/profileOutlineStore';
import type {Outline} from '@/services/profileOutlineStoreCore';
import type {PacksRecord} from '@/utils/packs/record';
import type {AreasMap} from '@/utils/radar/areas';
import {RADAR_TITLE} from '@/utils/radar/copy';
import {computeRadar} from '@/utils/radar/score';
import {BY_HABIT_TITLE, LAST_30_DAYS_TITLE, LAST_7_DAYS_TITLE, SUMMARY_FAILED_LINE} from '@/utils/copy/progress';

type Loaded = {
  userId: string;
  today: string;
  habits: SummaryHabit[];
  completions: GamiCompletion[];
  // the live radar's inputs kept on this phone (docs/PACKS_REPORTS_SPEC.md, section 11)
  packs: PacksRecord | null;
  areas: AreasMap;
  outline: Outline | null;
};

// The old Summary screen's body, moved here unchanged under Progress's level and streak cards: derived from local
// SQLite rows (utils/summary.ts), works offline. Refreshes on focus only: no sync trigger and no remote- or
// local-change listener (known limitation: a change that lands while the tab is open shows on the next visit). The
// Week/Month toggle is the one choice shared with the radar (hooks/use-radar-window.ts); the stats keep their 30-day
// month, the radar its 28 closed days. The radar is the only one in the app: Home's compact card is gone, and its
// Strongest and Needs-care lines sit under the radar's title.
export function SummarySection() {
  const userId = useSessionUid() ?? undefined;// this screen is only reachable while signed in (presumed or confirmed)
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);// the last load failed and nothing is shown: one quiet line
  const range: SummaryRange = useRadarWindow();
  const loadSeq = useRef(0);// only the latest load may set state

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++loadSeq.current;
    try {
      const today = getLocalDateString();
      // the radar's on-device inputs never fail the load: each reads as empty on its own failure
      const [rows, areas, packs, outline] = await Promise.all([
        getSummaryRows(userId) as Promise<{habits: SummaryHabit[]; completions: GamiCompletion[]}>,
        areasStore.read(userId),
        packsStore.peek(userId)?.parsed ?? packsStore.read(userId),
        profileOutlineStore.read(userId),
      ]);
      if (seq !== loadSeq.current) return;
      const next: Loaded = {userId, today, ...rows, packs: packs.kind === 'ok' ? packs.record : null, areas, outline};
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
  const radar = useMemo(() => (visible ? computeRadar({
    habits: visible.habits, completions: visible.completions, today: visible.today,
    packs: visible.packs, areas: visible.areas,
  }) : null), [visible]);
  const createHabit = useCallback(() => router.push('/habit-form'), []);

  return (
    <>
      {!summary && failed && <Text style={styles.empty}>{SUMMARY_FAILED_LINE}</Text>}

      {summary && current && (summary.month.empty === 'noHabits' ? (
        <SummaryEmptyCard kind="noHabits" onCreate={createHabit} />
      ) : (
        <>
          <RangeToggle value={range} onChange={setRadarWindow} />
          {current.empty ? (
            <SummaryEmptyCard kind="nothingScheduled" onCreate={createHabit} />
          ) : (
            <>
              <SummaryStats range={current} currentStreak={summary.currentStreak} />
              <Text style={styles.section} accessibilityRole="header">
                {range === 'week' ? LAST_7_DAYS_TITLE : LAST_30_DAYS_TITLE}
              </Text>
              {range === 'week'
                ? <WeekBars days={current.days} />
                : <HeatStrip days={current.days} leadingBlanks={current.leadingBlanks} />}
              {radar && visible && (
                <>
                  <Text style={styles.section} accessibilityRole="header">{RADAR_TITLE}</Text>
                  <RadarHighlights window={radar[range]} />
                  <RadarSummary window={radar[range]} outline={visible.outline} />
                </>
              )}
              <Text style={styles.section} accessibilityRole="header">{BY_HABIT_TITLE}</Text>
              <HabitRateList habits={current.habits} />
            </>
          )}
        </>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  section: {fontFamily: fonts.title, fontSize: 18, color: colors.text, paddingTop: spacing.sm},
});
