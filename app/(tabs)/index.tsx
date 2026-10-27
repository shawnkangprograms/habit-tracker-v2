import {useState, useCallback, useEffect, useRef} from 'react';//useState: store data that triggers re-renders; useCallback: stable fxn for useFocusEffect
import {router, useFocusEffect, useNavigation} from 'expo-router';// navigation to the Add/Edit form; run code whenever Home gains focus
import type {NativeStackNavigationProp} from 'expo-router/native-stack';
import type {ParamListBase} from 'expo-router/react-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import {getActiveHabitsWithDays, getHabitsWithTodayStatus} from '@/db/habits';// habit reads in SQLite
import {toggleCompletion} from '@/db/completions';// today's completion toggle
import {getGamificationStats} from '@/db/gamification';// XP, level and streak, derived from local rows
import {beginLoad as beginStatsLoad, publish as publishStats} from '@/services/statsStore';// shared with Profile and the tab icon
import {onRemoteChange} from '@/db/remoteChanges';// data pulled from another device changed local rows
import {requestSync} from '@/sync/syncEngine';// pull + push now (does nothing while sync is stopped)
import {getFirebaseAuth} from '@/services/authInit';// to read the signed-in user's id
import {getLocalDateString} from '@/utils/dates';
import {isDeepEqual} from '@/utils/equality';// skip a re-render when a reload returned what is already shown
import type {GamificationStats} from '@/utils/gamification';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {HabitIcon} from '@/constants/habitIcons';
import type {IconId} from '@/constants/habits';
import {StatsCard} from '@/components/stats-card';
import {HabitCheck} from '@/components/habit-check';
import {XpFloat} from '@/components/xp-float';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {useCelebrations, type TickStats} from '@/hooks/use-celebrations';// overlays, banner and toasts after a tick
import {CelebrationLayer} from '@/components/celebration-layer';
import {ReminderPrompt} from '@/components/reminder-prompt';// one-time "gentle evening reminder?" card
import {getNotificationPrefs, notificationPrefsLoaded, useNotificationPrefs} from '@/services/notificationPrefs';
import {shouldShowSoftPrompt} from '@/utils/notificationPrefs';
import {notificationsAvailable} from '@/services/notifications';
import {EmptyHomeCard} from '@/components/empty-home-card';// first-run card when there are no active habits
import {useFirstPull} from '@/hooks/use-first-pull';
import {homeEmptyState} from '@/utils/homeEmptyState';
import {
  fullDayName, scheduleSummary, shortDayName, splitHomeRows, weekdayOfDate, type ActiveHabit,
} from '@/utils/homeSections';
import {nextStatusChangeAt, rowTimeStatus, type TimeStatus} from '@/utils/timeStatus';
import {mark} from '@/utils/startupTrace';// startup trace (preview build only)
import {homeUsable} from '@/services/startupSignals';// deferred startup work waits for Home's first list

type Habit = {// one row from getHabitsWithTodayStatus: an active habit scheduled today, with today's status
  habitId: string;
  habitName: string;
  icon: IconId;
  frequencyType: 'daily' | 'weekdays';
  reminderTime: string | null;
  completed: number;
  completedAt: number;// the completion row's updatedAt: last user toggle (ms), 0 for a system row
  alarm: number;// 0/1: the bell shows when it is 1
};

// What Home shows: today's rows, every active habit (null if that read failed), and the local date they are for
type HomeList = {date: string; today: Habit[]; all: ActiveHabit[] | null};

// Home asks for a sync on focus at most this often, so switching tabs quickly doesn't hammer Firestore.
// Starts at load time: sign-in/launch already runs a cycle, so the first focus doesn't add another.
const FOCUS_SYNC_MIN_INTERVAL_MS = 30 * 1000;
let lastFocusSyncAt = Date.now();

type StatsSnapshot = {date: string; stats: GamificationStats};// stats plus the local date they were computed for
type Float = {key: number; amount: number};// one "+N XP" label
type LoadReason = 'focus' | 'remote' | 'toggle' | 'refresh' | 'day';// only for the dev timing log

// Dev only: one line per Home load, counts and milliseconds (never habit names)
// TODO: remove or reduce these timing logs (and the transitionEnd listener below) before the release build
function perfLog(message: string) {
  if (__DEV__) console.log(`Home perf: ${message}`);
}

// one light haptic when a habit is completed (Android: the haptics API the SDK 57 docs recommend over the vibrator)
function completionHaptic() {
  if (process.env.EXPO_OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// The time of a tap. Only ever called from the toggle handler; a plain function so the React Compiler lint
// doesn't mistake the handler's clock read for one during render.
function tapTime(): number {
  return Date.now();
}

// The clock for the time status: read at mount, by the status timeout and on returning to the foreground
function clockNow(): number {
  return Date.now();
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// "Thursday, October 9", built from the local YYYY-MM-DD so it never uses the UTC date
function formatToday(): string {
  const [year, month, day] = getLocalDateString().split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();// local constructor, so this is the local weekday
  return `${DAY_NAMES[weekday]}, ${MONTH_NAMES[month - 1]} ${day}`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Read aloud after the time; colour is never the only signal
const STATUS_WORDS: Partial<Record<TimeStatus, string>> = {onTime: 'done on time', overdue: 'overdue'};

// The reminder time of a Today row in its status colour: green with a check (on time), red with "Overdue",
// otherwise the normal subtitle colour. Never inside the done-row fade, so the green keeps its contrast.
function TimeText({time, status}: {time: string; status: TimeStatus}) {
  if (status === 'onTime') {
    return (
      <View style={styles.timeRow}>
        <Text style={[styles.time, styles.onTime]}>{time}</Text>
        <MaterialCommunityIcons name="check" size={11} color={colors.green} />
      </View>
    );
  }
  if (status === 'overdue') return <Text style={[styles.time, styles.overdue]}>{time} Overdue</Text>;
  return <Text style={styles.time}>{time}</Text>;
}

function Bell() {
  return <MaterialCommunityIcons name="bell-ring-outline" size={11} color={colors.muted} />;
}

export default function HomeScreen() {// default export, becomes the "index" tab per Expo router convention
  const [list, setList] = useState<HomeList>({date: getLocalDateString(), today: [], all: null});
  const [now, setNow] = useState(clockNow);// the clock the time status is computed from (see the status timeout below)
  const habits = list.today;// today's rows: the toggles, stats and celebrations only ever see these
  const [loaded, setLoaded] = useState(false);// false until the first load finishes, so the empty state doesn't flash
  const firstPull = useFirstPull();

  const user = getFirebaseAuth().currentUser;// this screen is only reachable while signed in
  const userId = user?.uid;
  const firstName = user?.displayName?.trim().split(/\s+/)[0];// only if auth already has a displayName

  useEffect(() => mark('home:mount'), []);

  // Home is "usable" on the frame after the first commit with the list loaded. Fires once per app run;
  // a remount (another account) finds it already fired.
  useEffect(() => {
    if (!loaded) return;
    mark('home:listCommitted');
    const frame = requestAnimationFrame(() => {
      mark('home:usable');
      homeUsable.fire();
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded]);

  const habitsRequest = useRef(0);// id of the newest list load; an older one finishing later is ignored
  const shownList = useRef<HomeList | null>(null);// the list currently in state, to skip identical reloads
  const focusedAt = useRef(0);// dev timing: when Home last gained focus

  // useCallback keeps the same fxn between renders, so the focus effect below doesn't rerun on every render
  // Resolves to today's rows it loaded, or null if there is no user or a newer load replaced it
  const loadHabits = useCallback(async (reason: LoadReason = 'focus'): Promise<Habit[] | null> => {
      if (!userId) return null;// no signed-in user: nothing to load
      const request = ++habitsRequest.current;
      const startedAt = performance.now();
      const date = getLocalDateString();

      // Two reads, in parallel, before setList so the screen renders once, complete: today's rows, and every
      // active habit with its weekdays (Other days, subtitles, the habit count). If the second read fails,
      // Today still shows, subtitles fall back to "Specific days" and Other days is hidden.
      const [rows, all] = await Promise.all([
        getHabitsWithTodayStatus(userId) as Promise<Habit[]>,// active habits scheduled today, for this user
        (getActiveHabitsWithDays(userId) as Promise<ActiveHabit[]>).catch(() => null),
      ]);

      if (request !== habitsRequest.current) return null;// a newer load started meanwhile (e.g. several pulled pages)
      const next: HomeList = {date, today: rows, all};
      const unchanged = isDeepEqual(shownList.current, next);
      if (!unchanged) {
        shownList.current = next;
        setList(next);// store fetched habits in state, triggering a re-render to display them
        setNow(clockNow());// same render: the status of an edited or added habit uses the current time, not an old tick
      }
      setLoaded(true);// no re-render once it is already true
      perfLog(`${reason} habits ${rows.length} today, ${all?.length ?? '?'} active in ${Math.round(performance.now() - startedAt)} ms (${unchanged ? 'unchanged, no render' : 'changed'})`);
      return rows;
  }, [userId]);

  const [stats, setStats] = useState<StatsSnapshot | null>(null);// null = not loaded or failed: the header card is hidden
  const statsRef = useRef<StatsSnapshot | null>(null);// the same snapshot, readable at tap time
  const statsRequest = useRef(0);// id of the newest stats load; older responses are ignored
  const statsSettled = useRef(0);// id of the newest load that has finished
  const inFlight = useRef(new Set<string>());// habitIds whose toggle is still running
  const [floats, setFloats] = useState<Record<string, Float>>({});// "+N XP" labels by habitId
  const reduceMotion = useReduceMotion();
  const celebration = useCelebrations(userId);
  const {onTick} = celebration;
  useNotificationPrefs();// loads the saved settings, so the soft prompt below knows whether it was answered
  const [reminderPrompt, setReminderPrompt] = useState(false);
  const closeReminderPrompt = useCallback(() => setReminderPrompt(false), []);

  // Never throws. Resolves to the new snapshot (null if it failed) with what the store publish replaced,
  // or to null if a newer load replaced this one.
  const loadStats = useCallback(async (reason: LoadReason = 'focus'): Promise<TickStats | null> => {
    if (!userId) return null;
    const request = ++statsRequest.current;
    const startedAt = performance.now();
    const date = getLocalDateString();
    // through the shared store, so Profile can join this load and reuse the result (never rejects)
    const load = beginStatsLoad(userId, date, () => getGamificationStats(userId) as Promise<GamificationStats>);
    const loaded = await load.promise;// null if it failed: the card hides; the habit list keeps working
    const snapshot: StatsSnapshot | null = loaded ? {date, stats: loaded.stats} : null;
    if (request !== statsRequest.current) return null;// stale
    const published = publishStats(loaded, load);// for Profile and the tab icon; a no-op if nothing changed
    if (loaded) mark('stats:published');
    statsSettled.current = request;
    const unchanged = isDeepEqual(statsRef.current, snapshot);// every field, incl. streaks and badges
    if (!unchanged) {
      statsRef.current = snapshot;
      setStats(snapshot);
    }
    perfLog(`${reason} stats in ${Math.round(performance.now() - startedAt)} ms (${unchanged ? 'unchanged, no render' : 'changed'})`);
    return {snapshot, published};
  }, [userId]);

  // Remote-change reloads, coalesced: one runs at a time, and changes arriving meanwhile cause one more run
  // after it (not one per pulled page). The stale-response guards in loadHabits/loadStats still apply.
  const remoteReload = useRef({running: false, again: false});
  const reloadForRemote = useCallback(async () => {
    const state = remoteReload.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        await Promise.all([
          loadHabits('remote').catch((err: unknown) => console.log('Home reload failed', err)),
          loadStats('remote'),
        ]);
      } while (state.again);
    } finally {
      state.running = false;
    }
  }, [loadHabits, loadStats]);

  useFocusEffect(useCallback(() => {// runs every time Home gains focus, so adds/edits/deletes from the form show immediately
    focusedAt.current = performance.now();
    loadHabits();
    loadStats();// in parallel; the list never waits for stats
    if (Date.now() - lastFocusSyncAt >= FOCUS_SYNC_MIN_INTERVAL_MS) {
      lastFocusSyncAt = Date.now();
      requestSync();// changes from another device arrive through onRemoteChange below
    }

    // while focused, data pulled from another device reloads Home in place: state updates only
    // (same keys, no remount, loaded stays true), so the list doesn't flicker or lose its scroll position
    return onRemoteChange(reloadForRemote);
  }, [loadHabits, loadStats, reloadForRemote]));

  // Time status clock. `now` is refreshed by a changed load (above), the timeout and a foreground return.
  // One timeout, to the next due minute end among today's unchecked timed rows or the next local midnight,
  // whichever is first; recomputed when the list or `now` changes, cleared on unmount. No interval, no loop:
  // the target is always after the current time, so each firing is one re-render and schedules a later one.
  // On a new local date (midnight, or back from the background on a later day) the list is reloaded once, so
  // an open Home never shows yesterday's "Overdue" (a stale date shows no status until that reload lands).
  const listDateShown = list.date;
  const tick = useCallback(() => {
    const t = clockNow();
    setNow(t);
    if (getLocalDateString(new Date(t)) !== listDateShown) {
      loadHabits('day').catch((err: unknown) => console.log('Home reload failed', err));
      loadStats('day');
    }
  }, [listDateShown, loadHabits, loadStats]);

  useEffect(() => {
    const t = clockNow();
    const delay = Math.max(0, nextStatusChangeAt(list.today, t, list.date) - t) + 50;// just past the boundary
    perfLog(`status timer in ${Math.round(delay / 1000)} s`);// dev: one line per scheduled timeout
    const timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [list, now, tick]);

  // JS timers pause in the background: recompute when the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => sub.remove();
  }, [tick]);

  // Dev timing: when the stack's back animation to the tabs finishes, relative to Home's focus,
  // to see whether the focus loads above overlap the animation
  const navigation = useNavigation();
  useEffect(() => {
    if (!__DEV__) return;
    const stack = navigation.getParent<NativeStackNavigationProp<ParamListBase>>();
    return stack?.addListener('transitionEnd', (e) => {
      if (e.data.closing) return;// only when the tabs become visible again
      perfLog(`stack transition ended ${Math.round(performance.now() - focusedAt.current)} ms after focus`);
    });
  }, [navigation]);

  const removeFloat = useCallback((habitId: string, key: number) => {
    setFloats((f) => {
      if (f[habitId]?.key !== key) return f;// a newer label replaced it
      const rest = {...f};
      delete rest[habitId];
      return rest;
    });
  }, []);

  const handleToggle = async (habit: Habit) => {
    if (!userId || inFlight.current.has(habit.habitId)) return;// ignore a second tap while this habit's toggle runs
    inFlight.current.add(habit.habitId);
    const completing = habit.completed === 0;
    const tickedAt = tapTime();// for "earlier than usual"
    // "before" only counts if no stats load was still running at tap time
    const before = statsSettled.current === statsRequest.current ? statsRef.current : null;
    try {
      let saved = false;
      try {
        await toggleCompletion(userId, habit.habitId, completing);
        saved = true;
      } catch (err) {
        Alert.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      let statsDone: Promise<TickStats | null> | null = null;
      if (saved) {
        if (completing) completionHaptic();
        // soft prompt: the first completing tick after this shipped, if never answered and the nudge is off
        // (never when this app binary has no notifications module)
        if (completing && notificationPrefsLoaded() && shouldShowSoftPrompt(getNotificationPrefs()) && notificationsAvailable()) {
          setReminderPrompt(true);
        }
        // not awaited: stats never slow the toggle or the list refresh
        statsDone = loadStats('toggle');
        statsDone.then((result) => {
          const after = result?.snapshot;
          if (!completing || reduceMotion || !before || !after || before.date !== after.date) return;
          const gained = after.stats.totalXp - before.stats.totalXp;// the real change, incl. perfect-day/milestone bonuses
          if (gained > 0) setFloats((f) => ({...f, [habit.habitId]: {key: Date.now(), amount: gained}}));
        });
      }
      const rows = await loadHabits('toggle');
      // Celebrations and messages: only for the user's own completing tick, after the list has updated.
      // They reuse the stats load above and the rows just loaded; nothing else is read except the early check.
      if (completing && statsDone && rows) onTick({habitId: habit.habitId, tickedAt, rows, stats: statsDone});
    } finally {
      inFlight.current.delete(habit.habitId);
    }
  };

  // Pull-to-refresh: sync now, then reload from SQLite. requestSync never rejects; offline or a failed
  // sync just ends the spinner (sync fails silently). The reload also picks up a new day after midnight.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    lastFocusSyncAt = Date.now();
    requestSync()
      .finally(() => {
        setRefreshing(false);
        loadHabits('refresh');
        loadStats('refresh');
      });
  }, [loadHabits, loadStats]);

  const doneToday = habits.filter((h) => h.completed === 1).length;// Home lists exactly the habits scheduled today
  // every active habit; if that read failed, today's rows if any, otherwise unknown (no false empty state)
  const activeCount = list.all ? list.all.length : (habits.length > 0 ? habits.length : null);
  const emptyState = homeEmptyState({
    habitCount: activeCount ?? 0,
    loading: !loaded || activeCount === null,// unknown count: show nothing rather than a false empty state
    firstPullDone: firstPull.firstPullDone,
    waitOver: firstPull.waitOver,
  });
  const {other} = splitHomeRows(habits, list.all, weekdayOfDate(list.date));
  const daysById = new Map((list.all ?? []).map((h) => [h.habitId, h.days]));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* the tab bar sits below the scene and handles the bottom inset itself */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}// iOS spinner
            colors={[colors.accent]}// Android spinner
            progressBackgroundColor={colors.surface}// Android spinner background
          />
        }>

        <View style={styles.greeting}>
          <Text style={styles.date}>{formatToday()}</Text>
          <Text style={styles.hello}>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Text>
        </View>

        {stats && loaded && (
          <StatsCard
            level={stats.stats.level}
            xpIntoLevel={stats.stats.xpIntoLevel}
            xpForNextLevel={stats.stats.xpForNextLevel}
            progress={stats.stats.progress}
            currentStreak={stats.stats.currentStreak}
            doneToday={doneToday}
            scheduledToday={habits.length}
          />
        )}

        {reminderPrompt && <ReminderPrompt onClose={closeReminderPrompt} />}

        <Text style={styles.title}>Today.</Text>

        {emptyState === 'checking' && (
          // a returning user on a new phone has no local habits until the first pull finishes
          <Text style={styles.empty} accessibilityLiveRegion="polite">Checking for your habits...</Text>
        )}
        {emptyState === 'empty' && (
          <EmptyHomeCard reduceMotion={reduceMotion} onPick={() => router.push('/habit-form')} />
        )}

        <View style={styles.list}>
          {habits.map((habit) => {
            const color = ICON_COLORS[habit.icon] ?? colors.accent;
            const done = habit.completed === 1;
            const schedule = scheduleSummary(habit.frequencyType, daysById.get(habit.habitId));
            const status = rowTimeStatus(habit, now, list.date);
            const alarmOn = habit.alarm === 1;
            const label = [habit.habitName, habit.reminderTime, STATUS_WORDS[status], schedule, alarmOn && 'alarm on']
              .filter(Boolean).join(', ');
            return (
              // tapping the card opens the Edit form
              <Pressable
                key={habit.habitId}
                style={[styles.card, {backgroundColor: `${color}14`, borderColor: `${color}54`}]}
                onPress={() => router.push({pathname: '/habit-form', params: {habitId: habit.habitId}})}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint="Opens the edit form">

                <View style={[styles.badge, {backgroundColor: `${color}30`, borderColor: `${color}80`}, done && styles.doneContent]}>
                  <HabitIcon id={habit.icon} size={21} color={color} />
                </View>

                <View style={styles.details}>
                  <Text style={[styles.name, done && styles.doneContent]} numberOfLines={1}>{habit.habitName}</Text>
                  <View style={styles.subtitleRow}>
                    <Text style={[styles.subtitle, styles.shrink, done && styles.doneContent]} numberOfLines={1}>
                      {habit.reminderTime ? `${schedule} · ` : schedule}
                    </Text>
                    {habit.reminderTime && <TimeText time={habit.reminderTime} status={status} />}
                    {alarmOn && <Bell />}
                  </View>
                </View>

                <HabitCheck
                  done={done}
                  habitName={habit.habitName}
                  reduceMotion={reduceMotion}
                  onPress={() => handleToggle(habit)}
                />

                {floats[habit.habitId] && (
                  <XpFloat
                    key={floats[habit.habitId].key}
                    amount={floats[habit.habitId].amount}
                    onDone={() => removeFloat(habit.habitId, floats[habit.habitId].key)}
                  />
                )}
              </Pressable>
            );
          })}

          {/* hidden while the first-run card shows, so there is one clear action */}
          {emptyState !== 'empty' && (
            <Pressable style={styles.addRow} onPress={() => router.push('/habit-form')}>
              <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />
              <Text style={styles.addText}>Add a habit</Text>
            </Pressable>
          )}
        </View>

        {/* active habits not due today: not completable, no status colours; tapping opens Edit */}
        {other.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Other days</Text>
            <View style={styles.list}>
              {other.map((habit) => {
                const icon = habit.icon as IconId;
                const color = ICON_COLORS[icon] ?? colors.accent;
                const schedule = scheduleSummary(habit.frequencyType, habit.days);
                const alarmOn = habit.alarm === 1;
                const label = [habit.habitName, schedule, habit.reminderTime, `next ${fullDayName(habit.next)}`, alarmOn && 'alarm on']
                  .filter(Boolean).join(', ');
                return (
                  <Pressable
                    key={habit.habitId}
                    style={[styles.card, {backgroundColor: `${color}14`, borderColor: `${color}54`}]}
                    onPress={() => router.push({pathname: '/habit-form', params: {habitId: habit.habitId}})}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityHint="Opens the edit form">

                    <View style={[styles.badge, {backgroundColor: `${color}30`, borderColor: `${color}80`}]}>
                      <HabitIcon id={icon} size={21} color={color} />
                    </View>

                    <View style={styles.details}>
                      <Text style={styles.name} numberOfLines={1}>{habit.habitName}</Text>
                      <View style={styles.subtitleRow}>
                        <Text style={[styles.subtitle, styles.shrink]} numberOfLines={1}>
                          {habit.reminderTime ? `${schedule} · ${habit.reminderTime}` : schedule}
                        </Text>
                        {alarmOn && <Bell />}
                      </View>
                    </View>

                    <Text style={styles.next}>Next: {shortDayName(habit.next)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>

      {/* one at a time: level-up / milestone overlay, perfect-day banner (top) or toast (bottom) */}
      <CelebrationLayer item={celebration.current} reduceMotion={reduceMotion} onDismiss={celebration.dismiss} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: 18, gap: 10},
  greeting: {paddingTop: 5, gap: 1},
  date: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  hello: {fontFamily: fonts.title, fontSize: 26, color: colors.text},
  title: {fontFamily: fonts.title, fontSize: 21, color: colors.text},
  sectionTitle: {fontFamily: fonts.title, fontSize: 17, color: colors.text, marginTop: spacing.sm},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  list: {gap: 7},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 59,
    paddingHorizontal: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: radii.iconBadge,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {flex: 1, gap: 2},
  name: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  subtitleRow: {flexDirection: 'row', alignItems: 'center', gap: 3},
  subtitle: {fontFamily: fonts.regular, fontSize: 10, color: colors.muted},
  shrink: {flexShrink: 1},
  timeRow: {flexDirection: 'row', alignItems: 'center', gap: 2},
  time: {fontFamily: fonts.regular, fontSize: 10, color: colors.muted},
  onTime: {fontFamily: fonts.semiBold, color: colors.green},
  overdue: {fontFamily: fonts.semiBold, color: colors.error},
  next: {fontFamily: fonts.semiBold, fontSize: 11, color: colors.muted},
  doneContent: {opacity: 0.55},
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 59,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  addText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.accent},
});
