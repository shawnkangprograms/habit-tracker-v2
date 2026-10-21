import {useState, useCallback, useEffect, useRef} from 'react';//useState: store data that triggers re-renders; useCallback: stable fxn for useFocusEffect
import {router, useFocusEffect, useNavigation} from 'expo-router';// navigation to the Add/Edit form; run code whenever Home gains focus
import type {NativeStackNavigationProp} from 'expo-router/native-stack';
import type {ParamListBase} from 'expo-router/react-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import {getActiveHabitDays, getHabitsWithTodayStatus} from '@/db/habits';// habit reads in SQLite
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
import type {IconId, WeekdayKey} from '@/constants/habits';
import {StatsCard} from '@/components/stats-card';
import {HabitCheck} from '@/components/habit-check';
import {XpFloat} from '@/components/xp-float';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {useCelebrations, type TickStats} from '@/hooks/use-celebrations';// overlays, banner and toasts after a tick
import {CelebrationLayer} from '@/components/celebration-layer';

type Habit = {// one row from getHabitsWithTodayStatus: an active habit scheduled today, with today's status
  habitId: string;
  habitName: string;
  icon: IconId;
  frequencyType: 'daily' | 'weekdays';
  reminderTime: string | null;
  completed: number;
  days?: WeekdayKey[];// only for weekday habits; undefined if the lookup failed
};

// Home asks for a sync on focus at most this often, so switching tabs quickly doesn't hammer Firestore.
// Starts at load time: sign-in/launch already runs a cycle, so the first focus doesn't add another.
const FOCUS_SYNC_MIN_INTERVAL_MS = 30 * 1000;
let lastFocusSyncAt = Date.now();

type StatsSnapshot = {date: string; stats: GamificationStats};// stats plus the local date they were computed for
type Float = {key: number; amount: number};// one "+N XP" label
type LoadReason = 'focus' | 'remote' | 'toggle' | 'refresh';// only for the dev timing log

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

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];// display order, Monday first
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

// "Every day · 07:30", "Mon, Wed, Fri", or "Specific days" if the weekday lookup failed
function subtitle(habit: Habit): string {
  let schedule = 'Every day';
  if (habit.frequencyType === 'weekdays') {
    schedule = habit.days
      ? DAY_ORDER.filter((d) => habit.days!.includes(d))
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
          .join(', ')
      : 'Specific days';
  }
  return habit.reminderTime ? `${schedule} · ${habit.reminderTime}` : schedule;
}

export default function HomeScreen() {// default export, becomes the "index" tab per Expo router convention
  const [habits, setHabits] = useState<Habit[]>([]);// habits: current list in state, starts empty; setHabits: how we update it
  const [loaded, setLoaded] = useState(false);// false until the first load finishes, so the empty state doesn't flash

  const user = getFirebaseAuth().currentUser;// this screen is only reachable while signed in
  const userId = user?.uid;
  const firstName = user?.displayName?.trim().split(/\s+/)[0];// only if auth already has a displayName

  const habitsRequest = useRef(0);// id of the newest list load; an older one finishing later is ignored
  const shownHabits = useRef<Habit[]>([]);// the list currently in state, to skip identical reloads
  const focusedAt = useRef(0);// dev timing: when Home last gained focus

  // useCallback keeps the same fxn between renders, so the focus effect below doesn't rerun on every render
  // Resolves to the rows it loaded, or null if there is no user or a newer load replaced it
  const loadHabits = useCallback(async (reason: LoadReason = 'focus'): Promise<Habit[] | null> => {
      if (!userId) return null;// no signed-in user: nothing to load
      const request = ++habitsRequest.current;
      const startedAt = performance.now();

      // Weekday habits need their days for the subtitle: one read for all of them, before setHabits so the list
      // renders once, complete. If that read fails, the subtitles fall back to "Specific days".
      const [rows, daysByHabit] = await Promise.all([
        getHabitsWithTodayStatus(userId) as Promise<Habit[]>,// active habits scheduled today, for this user
        (getActiveHabitDays(userId) as Promise<Record<string, WeekdayKey[]>>).catch(() => ({} as Record<string, WeekdayKey[]>)),
      ]);
      const result = rows.map((habit) => {
        const days = habit.frequencyType === 'weekdays' ? daysByHabit[habit.habitId] : undefined;
        return days ? {...habit, days} : habit;
      });

      if (request !== habitsRequest.current) return null;// a newer load started meanwhile (e.g. several pulled pages)
      const unchanged = isDeepEqual(shownHabits.current, result);
      if (!unchanged) {
        shownHabits.current = result;
        setHabits(result);// store fetched habits in state, triggering a re-render to display them
      }
      setLoaded(true);// no re-render once it is already true
      perfLog(`${reason} habits ${result.length} rows in ${Math.round(performance.now() - startedAt)} ms (${unchanged ? 'unchanged, no render' : 'changed'})`);
      return result;
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

        <Text style={styles.title}>Today.</Text>

        {loaded && habits.length === 0 && (
          <Text style={styles.empty}>No habits yet. Tap Add a habit to start.</Text>
        )}

        <View style={styles.list}>
          {habits.map((habit) => {
            const color = ICON_COLORS[habit.icon] ?? colors.accent;
            const done = habit.completed === 1;
            return (
              // tapping the card opens the Edit form
              <Pressable
                key={habit.habitId}
                style={[styles.card, {backgroundColor: `${color}14`, borderColor: `${color}54`}]}
                onPress={() => router.push({pathname: '/habit-form', params: {habitId: habit.habitId}})}>

                <View style={[styles.badge, {backgroundColor: `${color}30`, borderColor: `${color}80`}, done && styles.doneContent]}>
                  <HabitIcon id={habit.icon} size={21} color={color} />
                </View>

                <View style={[styles.details, done && styles.doneContent]}>
                  <Text style={styles.name} numberOfLines={1}>{habit.habitName}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>{subtitle(habit)}</Text>
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

          <Pressable style={styles.addRow} onPress={() => router.push('/habit-form')}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />
            <Text style={styles.addText}>Add a habit</Text>
          </Pressable>
        </View>

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
  subtitle: {fontFamily: fonts.regular, fontSize: 10, color: colors.muted},
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
