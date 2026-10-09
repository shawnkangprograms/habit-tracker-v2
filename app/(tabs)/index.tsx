import {useState, useCallback} from 'react';//useState: store data that triggers re-renders; useCallback: stable fxn for useFocusEffect
import {router, useFocusEffect} from 'expo-router';// navigation to the Add/Edit form; run code whenever Home gains focus
import {SafeAreaView} from 'react-native-safe-area-context';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {getHabit, getHabitsWithTodayStatus} from '@/db/habits';// habit reads in SQLite
import {toggleCompletion} from '@/db/completions';// today's completion toggle
import {getFirebaseAuth} from '@/services/authInit';// to read the signed-in user's id
import {getLocalDateString} from '@/utils/dates';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {HabitIcon} from '@/constants/habitIcons';
import type {IconId, WeekdayKey} from '@/constants/habits';

type Habit = {// one row from getHabitsWithTodayStatus: an active habit scheduled today, with today's status
  habitId: string;
  habitName: string;
  icon: IconId;
  frequencyType: 'daily' | 'weekdays';
  reminderTime: string | null;
  completed: number;
  days?: WeekdayKey[];// only for weekday habits; undefined if the lookup failed
};

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

  // useCallback keeps the same fxn between renders, so the focus effect below doesn't rerun on every render
  const loadHabits = useCallback(async () => {
      if (!userId) return;// no signed-in user: nothing to load
      const rows = (await getHabitsWithTodayStatus(userId)) as Habit[];// active habits scheduled today, for this user

      // Weekday habits need their days for the subtitle. Fetched before setHabits so the list renders once, complete.
      const result = await Promise.all(rows.map(async (habit) => {
        if (habit.frequencyType !== 'weekdays') return habit;
        try {
          const full = await getHabit(userId, habit.habitId);
          return full?.frequency.type === 'weekdays' ? {...habit, days: full.frequency.days as WeekdayKey[]} : habit;
        } catch {
          return habit;// lookup failed: subtitle falls back to "Specific days"
        }
      }));

      setHabits(result);// store fetched habits in state, triggering a re-render to display them
      setLoaded(true);
  }, [userId]);

  useFocusEffect(useCallback(() => {// runs every time Home gains focus, so adds/edits/deletes from the form show immediately
    loadHabits();
  }, [loadHabits]));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* the tab bar sits below the scene and handles the bottom inset itself */}
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.greeting}>
          <Text style={styles.date}>{formatToday()}</Text>
          <Text style={styles.hello}>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Text>
        </View>

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

                <Pressable
                  hitSlop={12}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: done}}
                  accessibilityLabel={`Mark ${habit.habitName} as ${done ? 'not done' : 'done'}`}
                  style={[styles.check, done && styles.checkDone]}
                  onPress={async () => {
                    try {
                      await toggleCompletion(userId, habit.habitId, habit.completed === 0);
                    } catch (err) {
                      Alert.alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
                    }
                    loadHabits();
                  }}>
                  {done && <MaterialCommunityIcons name="check" size={17} color={colors.white} />}
                </Pressable>
              </Pressable>
            );
          })}

          <Pressable style={styles.addRow} onPress={() => router.push('/habit-form')}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />
            <Text style={styles.addText}>Add a habit</Text>
          </Pressable>
        </View>

      </ScrollView>
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
  check: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {backgroundColor: colors.green, borderColor: colors.green},
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
