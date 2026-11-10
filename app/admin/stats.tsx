import {useCallback, useMemo, useState} from 'react';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {getStatsDocs, refreshTodayStats} from '@/services/adminStats';
import {useAdminData} from '@/services/useAdminData';
import {AdminStatus} from '@/components/admin-status';
import {SwitchRow} from '@/components/switch-row';
import {EMPTY_TEXT, SplitBar, StatCard} from '@/components/admin-stat-card';
import {LineChart, type LineSeries} from '@/components/charts/line-chart';
import {BarChart} from '@/components/charts/bar-chart';
import {DonutChart, type DonutSlice} from '@/components/charts/donut-chart';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {
  COMPLETION_SUBTITLE, DEFAULT_RANGE, RANGES, REFRESH_MESSAGES, STATS_INFO as INFO, TODAY_CAPTION, activeUsersLabel,
  aiLabel, areasLabel, buildStatsView, clockTime, completionLabel, dayLabel, hasValues, niceMax, refreshOutcomeOf,
  shortDate, signupsLabel, splitLabel, type AreaKey, type RangeDays,
} from '@/utils/adminStats';

// module level, so useAdminData gets a stable fetcher. One read of the 90-day maximum; ranges filter in memory.
const fetchStats = async () => ({docs: await getStatsDocs(), loadedAt: Date.now()});

const AREA_COLORS: Record<AreaKey, string> = {
  Learning: colors.amber,
  Mind: colors.purple,
  Career: colors.blue,
  Discipline: colors.accent,
  Relations: colors.pink,
  Health: colors.green,
  none: colors.muted,
};

type RefreshState = {kind: 'idle'} | {kind: 'running'} | {kind: 'failed'; message: string};

function goBackToOverview() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/overview');
}

export default function AdminStatsScreen() {
  const {load, retry, reload} = useAdminData(fetchStats);
  const [days, setDays] = useState<RangeDays>(DEFAULT_RANGE);
  const [includeTest, setIncludeTest] = useState(false);
  const [refresh, setRefresh] = useState<RefreshState>({kind: 'idle'});

  // "now" is the load time, so the range only moves on a load (never mid-render)
  const view = useMemo(
    () => (load.status === 'ready' ? buildStatsView(load.data.docs, {days, includeTest, nowMs: load.data.loadedAt}) : null),
    [load, days, includeTest],
  );

  const onRefresh = useCallback(async () => {
    setRefresh({kind: 'running'});
    try {
      await refreshTodayStats();
      setRefresh({kind: 'idle'});
      reload();
    } catch (err) {
      setRefresh({kind: 'failed', message: REFRESH_MESSAGES[refreshOutcomeOf(err)]});
    }
  }, [reload]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backRow} onPress={goBackToOverview} hitSlop={12} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
          <Text style={styles.backText}>Admin</Text>
        </Pressable>

        <Text style={styles.title}>Stats</Text>

        <View style={styles.segments} accessibilityRole="tablist">
          {RANGES.map((r) => {
            const selected = r === days;
            return (
              <Pressable key={r} onPress={() => setDays(r)} style={[styles.segment, selected && styles.segmentOn]}
                accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={`Last ${r} days`}>
                <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{r} days</Text>
              </Pressable>
            );
          })}
        </View>

        <SwitchRow icon="flask-outline" label="Include test accounts" value={includeTest} onChange={setIncludeTest} />

        <View style={styles.refreshRow}>
          <Pressable
            onPress={onRefresh}
            disabled={refresh.kind === 'running' || load.status !== 'ready'}
            style={({pressed}) => [styles.refreshButton, pressed && styles.pressed,
              (refresh.kind === 'running' || load.status !== 'ready') && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Refresh today's numbers">
            {refresh.kind === 'running'
              ? <ActivityIndicator size="small" color={colors.white} />
              : <MaterialCommunityIcons name="refresh" size={18} color={colors.white} />}
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
          <Text style={[styles.refreshStatus, refresh.kind === 'failed' && styles.refreshFailed]} numberOfLines={2}
            accessibilityLiveRegion="polite">
            {refresh.kind === 'failed'
              ? refresh.message
              : refresh.kind === 'running'
                ? 'Refreshing…'
                : view?.updatedAtMs ? `Updated ${clockTime(view.updatedAtMs)}` : ''}
          </Text>
        </View>

        {load.status === 'loading' && <AdminStatus kind="loading" />}
        {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={retry} />}
        {view && <StatsCards view={view} days={days} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatsCards({view, days}: {view: ReturnType<typeof buildStatsView>; days: RangeDays}) {
  const xLabels = useMemo(() => view.dates.map(shortDate), [view.dates]);
  const pointLabels = useMemo(() => view.dates.map(dayLabel), [view.dates]);

  const activeSeries = useMemo<LineSeries[]>(() => [
    {label: 'Opened the app', values: view.opened, color: colors.accent},
    {label: 'Logged a habit', values: view.logged, color: colors.blue, dashed: true},
  ], [view.opened, view.logged]);
  const activeMax = niceMax(Math.max(0, ...view.opened.map((v) => v ?? 0), ...view.logged.map((v) => v ?? 0)));

  const completionSeries = useMemo<LineSeries[]>(
    () => [{label: 'Completion', values: view.completionPercent, color: colors.green}],
    [view.completionPercent],
  );

  const signupValues = useMemo(() => view.signupWeeks.map((w) => w.count), [view.signupWeeks]);
  const signupX = useMemo(() => view.signupWeeks.map((w) => shortDate(w.weekStart)), [view.signupWeeks]);
  const signupBars = useMemo(() => view.signupWeeks.map((w) => `Week of ${shortDate(w.weekStart)}`), [view.signupWeeks]);

  const slices = useMemo<DonutSlice[]>(
    () => view.areas.map((s) => ({...s, color: AREA_COLORS[s.key]})),
    [view.areas],
  );

  const trendEmpty = !hasValues(view.opened) && !hasValues(view.logged);
  const todayEmpty = view.today.opened === null && view.today.logged === null;
  const setupEmpty = !view.setup || view.areaTotal === 0;

  return (
    <View style={styles.cards}>
      <StatCard title="Active users" info={INFO.active} empty={trendEmpty && todayEmpty}>
        <View style={styles.tiles}>
          <Tile label="Opened the app" value={view.today.opened} />
          <Tile label="Logged a habit" value={view.today.logged} />
        </View>
        {trendEmpty
          ? <Text style={styles.chartEmpty}>{EMPTY_TEXT}</Text>
          : <LineChart series={activeSeries} xLabels={xLabels} pointLabels={pointLabels} max={activeMax}
              accessibilityLabel={activeUsersLabel(view, days)} />}
      </StatCard>

      <StatCard title="Sign-ups per week" subtitle="Last 13 weeks" info={INFO.signups} empty={view.signupWeeks.length === 0}>
        <BarChart values={signupValues} xLabels={signupX} barLabels={signupBars}
          max={niceMax(Math.max(0, ...signupValues))} color={colors.green} valueOne="sign-up" valueOther="sign-ups"
          accessibilityLabel={signupsLabel(view)} />
      </StatCard>

      <StatCard title="Completion rate" subtitle={COMPLETION_SUBTITLE} info={INFO.completion}
        empty={!hasValues(view.completionPercent)}>
        <LineChart series={completionSeries} xLabels={xLabels} pointLabels={pointLabels} max={100}
          format={(v) => `${v}%`} accessibilityLabel={completionLabel(view, days)} />
      </StatCard>

      <StatCard title="Habits by area" subtitle="By habit icon" info={INFO.areas} empty={view.areaTotal === 0}>
        <DonutChart slices={slices} totalLabel={view.areaTotal === 1 ? 'habit' : 'habits'} accessibilityLabel={areasLabel(view)} />
      </StatCard>

      <StatCard title="Habit setup" info={INFO.setup} empty={setupEmpty}>
        {view.setup && (
          <View style={styles.splits}>
            <SplitBar title="Schedule" split={view.setup.frequency} leftColor={colors.accent} rightColor={colors.blue}
              accessibilityLabel={splitLabel('Schedule', view.setup.frequency)} />
            <SplitBar title="Reminders" split={view.setup.reminders} leftColor={colors.amber} rightColor={colors.muted}
              accessibilityLabel={splitLabel('Reminders', view.setup.reminders)} />
            <SplitBar title="Added by" split={view.setup.source} leftColor={colors.green} rightColor={colors.purple}
              accessibilityLabel={splitLabel('Added by', view.setup.source)} />
          </View>
        )}
      </StatCard>

      <StatCard title="AI insights per day" info={INFO.ai} empty={!hasValues(view.aiCalls)}>
        <BarChart values={view.aiCalls} xLabels={xLabels} barLabels={pointLabels}
          max={niceMax(Math.max(0, ...view.aiCalls.map((v) => v ?? 0)))} color={colors.purple} valueOne="request" valueOther="requests"
          accessibilityLabel={aiLabel(view, days)} />
      </StatCard>
    </View>
  );
}

// Today's number so far ("—" until today's document exists: the nightly run writes yesterday, Refresh writes today)
function Tile({label, value}: {label: string; value: number | null}) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}, ${TODAY_CAPTION}: ${value === null ? 'no data yet' : value}`}>
      <Text style={styles.tileValue}>{value === null ? '—' : value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileDay}>{TODAY_CAPTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm},
  segments: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {flex: 1, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  segmentOn: {backgroundColor: colors.accent},
  segmentText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  segmentTextOn: {color: colors.white},
  refreshRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  refreshText: {fontFamily: fonts.title, fontSize: 15, color: colors.white},
  refreshStatus: {flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  refreshFailed: {color: colors.text},
  pressed: {opacity: 0.85},
  disabled: {opacity: 0.6},
  cards: {gap: spacing.md, marginTop: spacing.sm},
  tiles: {flexDirection: 'row', gap: spacing.md},
  tile: {
    flex: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.habitCard,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileValue: {fontFamily: fonts.title, fontSize: 26, color: colors.text},
  tileLabel: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.text},
  tileDay: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  splits: {gap: spacing.lg},
  chartEmpty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, paddingVertical: spacing.md, textAlign: 'center'},
});
