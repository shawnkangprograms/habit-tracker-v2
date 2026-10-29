import {useState, useEffect, useRef} from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {addHabit, getHabit, softDeleteHabit, updateHabit} from '@/db/habits';
import {getFirebaseAuth} from '@/services/authInit';
import {
  ICON_IDS, REMIND_BEFORE_OPTIONS, type Frequency, type IconId, type RemindBeforeMin, type WeekdayKey,
} from '@/constants/habits';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {
  validateFrequency, validateHabitInput, validateHabitName, validateIcon, validateReminderTime,
} from '@/validation/validators';
import {StarterIdeas, type StarterIdea} from '@/components/starter-ideas';
import {SwitchRow} from '@/components/switch-row';
import {TimeField} from '@/components/time-field';
import {loadNotificationPrefs, useNotificationPrefs} from '@/services/notificationPrefs';
import {
  getNotificationPermission, notificationsAvailable, requestNotificationPermission, type PermissionState,
} from '@/services/notifications';
import {shouldAskOnReminderSave} from '@/utils/notificationPrefs';
import {DEFAULT_REMINDER_TIME, LEAD_LABELS, reminderTimingNote, timingNoteText} from '@/utils/reminderForm';

// For the timing line under the chips: a plain function so the React Compiler lint doesn't treat it as a render-time read
function clockNow(): Date {
  return new Date();
}

const NAME_MAX = 30; // display only; validateHabitName enforces the limit

// Shown Mon to Sun; the keys are the stored WEEKDAY_KEYS values
const DAY_CHIPS: {key: WeekdayKey; label: string}[] = [
  {key: 'mon', label: 'M'}, {key: 'tue', label: 'T'}, {key: 'wed', label: 'W'}, {key: 'thu', label: 'T'},
  {key: 'fri', label: 'F'}, {key: 'sat', label: 'S'}, {key: 'sun', label: 'S'},
];

type FieldErrors = {name?: string; icon?: string; frequency?: string; reminder?: string};

// Optional habitId param: absent = Add mode, present = Edit mode
export default function HabitFormScreen() {
  const params = useLocalSearchParams<{habitId?: string}>();
  const habitId = typeof params.habitId === 'string' && params.habitId ? params.habitId : undefined;
  const isEdit = !!habitId;
  const userId = getFirebaseAuth().currentUser?.uid;

  // Add mode defaults match the Figma frame: star selected, Every day
  const [habitName, setHabitName] = useState('');
  const [icon, setIcon] = useState<IconId | null>('star');
  const [isWeekdays, setIsWeekdays] = useState(false);
  const [selectedDays, setSelectedDays] = useState<WeekdayKey[]>([]);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminder, setReminder] = useState('');// HH:MM; kept while the switch is off, saved only while it is on
  const [alarm, setAlarm] = useState(false);
  const [lead, setLead] = useState<RemindBeforeMin>(0);
  const notificationPrefs = useNotificationPrefs();
  const [available] = useState(notificationsAvailable);// fixed for the app run: the module loads once or never
  const [permission, setPermission] = useState<PermissionState | null>(null);// never asks; read once for the note
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isLoaded, setIsLoaded] = useState(!isEdit); // Edit mode waits for the habit before showing the form
  const savingRef = useRef(false); // a ref, not state, so a second tap in the same frame is ignored

  useEffect(() => {
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again to manage your habits.', [{text: 'OK', onPress: goBack}]);
      return;
    }
    if (!habitId) return;

    getHabit(userId, habitId)
      .then((habit) => {
        if (!habit) {
          Alert.alert('Habit not found', 'This habit no longer exists.', [{text: 'OK', onPress: goBack}]);
          return;
        }
        setHabitName(habit.habitName);
        // an icon id outside the allowed list leaves the grid unselected; Save then shows the icon error
        setIcon((ICON_IDS as readonly string[]).includes(habit.icon) ? habit.icon : null);
        if (habit.frequency.type === 'weekdays') {
          setIsWeekdays(true);
          setSelectedDays(habit.frequency.days);
        }
        setReminderOn(habit.reminderTime !== null);
        setReminder(habit.reminderTime ?? '');
        setAlarm(habit.alarm);
        setLead(habit.remindBeforeMin);
        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.', [{text: 'OK', onPress: goBack}]);
      });
  }, [userId, habitId]);

  useEffect(() => {
    if (available) getNotificationPermission().then(setPermission);
  }, [available]);

  // After a save with a reminder time: the in-context permission request (Android 13+ and iOS), only while
  // reminders are on and the app has never asked. Never throws; a denial just leaves reminders silent.
  async function askForReminderPermission() {
    if (!available) return;
    const [prefs, current] = await Promise.all([loadNotificationPrefs(), getNotificationPermission()]);
    if (shouldAskOnReminderSave(prefs, current)) await requestNotificationPermission();
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const clearError = (field: keyof FieldErrors) => setErrors((e) => ({...e, [field]: undefined}));

  const toggleDay = (day: WeekdayKey) => {
    setSelectedDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
    clearError('frequency');
  };

  // Add mode: a starter idea fills every field (still editable; Save validates as usual)
  const applyStarter = (idea: StarterIdea) => {
    setHabitName(idea.habitName);
    setIcon(idea.icon);
    setIsWeekdays(idea.frequency.type === 'weekdays');
    setSelectedDays(idea.frequency.type === 'weekdays' ? idea.frequency.days : []);
    setReminderOn(idea.reminderTime !== null);
    setReminder(idea.reminderTime ?? '');
    setAlarm(idea.alarm);
    setLead(idea.remindBeforeMin);
    setErrors({});
  };

  // On: show the time (09:00 if none yet). Off: saved as no reminder, with no alarm and no lead.
  const toggleReminder = (on: boolean) => {
    setReminderOn(on);
    if (on && reminder.trim() === '') setReminder(DEFAULT_REMINDER_TIME);
    clearError('reminder');
  };

  const handleSave = async () => {
    if (savingRef.current) return; // ignore extra taps while saving

    const reminderTime = reminderOn ? reminder.trim() : null;
    const frequency: Frequency = isWeekdays ? {type: 'weekdays', days: selectedDays} : {type: 'daily'};

    // individual validators so every field can show its own message at once
    const name = validateHabitName(habitName);
    const iconResult = validateIcon(icon);
    const freq = validateFrequency(frequency);
    const time = validateReminderTime(reminderTime);
    setErrors({
      name: name.valid ? undefined : name.error,
      icon: iconResult.valid ? undefined : iconResult.error,
      frequency: freq.valid ? undefined : freq.error,
      reminder: time.valid ? undefined : time.error,
    });

    const input = validateHabitInput({
      habitName, icon, frequency, reminderTime,
      alarm: reminderOn ? alarm : false,
      remindBeforeMin: reminderOn ? lead : 0,
    });
    if (!input.valid || !userId) return;

    savingRef.current = true;
    try {
      if (habitId) await updateHabit(userId, habitId, input.value);
      else await addHabit(userId, input.value);
      if (reminderTime !== null) await askForReminderPermission();
      goBack();
    } catch (err) {
      Alert.alert("Couldn't save habit", err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      savingRef.current = false;
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete habit?', 'This habit will be removed from Home.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await softDeleteHabit(userId, habitId);
            goBack();
          } catch (err) {
            Alert.alert("Couldn't delete habit", err instanceof Error ? err.message : 'Something went wrong. Please try again.');
          }
        },
      },
    ]);
  };

  // all hooks above run before any early return
  if (!isLoaded) return <SafeAreaView style={styles.screen} />;

  const nameLength = Array.from(habitName.trim()).length; // trimmed code points, as the validator counts
  const timingLine = reminderOn ? timingNoteText(reminderTimingNote({
    reminderTime: reminder.trim(),
    remindBeforeMin: lead,
    frequency: isWeekdays ? {type: 'weekdays', days: selectedDays} : {type: 'daily'},
    now: clockNow(),
  }), reminder.trim()) : null;
  // a time is set, but this phone won't notify: say why, with a way to Settings
  const notifyNote = !reminderOn ? null
    : !available ? "Reminders aren't available in this version of the app on this phone yet."
    : !notificationPrefs.remindersOn ? 'Habit reminders are off in Settings, so this habit won’t notify you.'
    : permission === 'denied' ? 'Notifications are off for HabitQuest in your phone settings.'
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* iOS: padding lifts the content above the keyboard. Android: the window resizes (softwareKeyboardLayoutMode defaults to resize), so no behaviour is set */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <Pressable style={styles.backRow} onPress={goBack} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>Home</Text>
          </Pressable>

          <Text style={styles.title}>{isEdit ? 'Edit habit' : 'New habit'}</Text>

          {!isEdit && <StarterIdeas onPick={applyStarter} />}

          {/* HABIT NAME */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>HABIT NAME</Text>
              <Text style={[styles.label, nameLength > NAME_MAX && styles.errorColor]}>{nameLength}/{NAME_MAX}</Text>
            </View>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={habitName}
              onChangeText={(text) => { setHabitName(text); clearError('name'); }}
              placeholder="e.g. Read 10 pages"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              returnKeyType="done"
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
          </View>

          {/* ICON */}
          <View style={styles.section}>
            <Text style={[styles.label, styles.labelGap]}>ICON</Text>
            <View style={styles.iconGrid}>
              {ICON_IDS.map((id) => {
                const selected = icon === id;
                const tint = ICON_COLORS[id];
                return (
                  <Pressable
                    key={id}
                    onPress={() => { setIcon(id); clearError('icon'); }}
                    style={[styles.iconTile, selected && {borderWidth: 2, borderColor: tint, backgroundColor: tint + '30'}]}
                    accessibilityRole="button"
                    accessibilityLabel={id}
                    accessibilityState={{selected}}>
                    <HabitIcon id={id} size={24} color={selected ? tint : colors.muted} />
                  </Pressable>
                );
              })}
            </View>
            {errors.icon ? <Text style={styles.errorText}>{errors.icon}</Text> : null}
          </View>

          {/* REPEATS */}
          <View style={styles.section}>
            <Text style={[styles.label, styles.labelGap]}>REPEATS</Text>
            <View style={styles.repeatRow}>
              {[{weekdays: false, text: 'Every day'}, {weekdays: true, text: 'Specific days'}].map((option) => {
                const selected = isWeekdays === option.weekdays;
                return (
                  <Pressable
                    key={option.text}
                    onPress={() => { setIsWeekdays(option.weekdays); clearError('frequency'); }}
                    style={[styles.repeatPill, selected ? styles.pillSelected : styles.pillUnselected]}
                    accessibilityRole="button"
                    accessibilityState={{selected}}>
                    <Text style={[styles.repeatText, selected && styles.whiteText]}>{option.text}</Text>
                  </Pressable>
                );
              })}
            </View>
            {isWeekdays && (
              <View style={styles.dayRow}>
                {DAY_CHIPS.map(({key, label}) => {
                  const selected = selectedDays.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleDay(key)}
                      style={[styles.dayChip, selected ? styles.pillSelected : styles.pillUnselected]}
                      accessibilityRole="button"
                      accessibilityLabel={key}
                      accessibilityState={{selected}}>
                      <Text style={[styles.dayText, selected && styles.whiteText]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {errors.frequency ? <Text style={styles.errorText}>{errors.frequency}</Text> : null}
          </View>

          {/* REMINDER: time switch, picker, lead chips, alarm switch */}
          <View style={styles.section}>
            <Text style={[styles.label, styles.labelGap]}>REMINDER (OPTIONAL)</Text>
            <SwitchRow icon="clock-outline" label="Reminder time" value={reminderOn} onChange={toggleReminder} />

            {reminderOn && (
              <View style={styles.reminderBody}>
                <TimeField
                  value={reminder}
                  onChange={(time) => { setReminder(time); clearError('reminder'); }}
                  error={!!errors.reminder}
                />
                {errors.reminder ? <Text style={styles.errorText}>{errors.reminder}</Text> : null}

                {notifyNote && (
                  <View style={styles.note}>
                    <Text style={styles.noteText}>{notifyNote}</Text>
                    <Pressable
                      onPress={() => router.navigate('/settings')}
                      hitSlop={12}
                      accessibilityRole="link"
                      accessibilityLabel="Open Settings">
                      <Text style={styles.noteLink}>Open Settings</Text>
                    </Pressable>
                  </View>
                )}

                <Text style={[styles.label, styles.subLabel]}>HEADS-UP</Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Heads-up">
                  {REMIND_BEFORE_OPTIONS.map((minutes) => {
                    const selected = lead === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => setLead(minutes)}
                        style={[styles.chip, selected ? styles.pillSelected : styles.pillUnselected]}
                        hitSlop={4}
                        accessibilityRole="radio"
                        accessibilityState={{selected}}>
                        <Text style={[styles.chipText, selected && styles.whiteText]}>{LEAD_LABELS[minutes]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {timingLine && <Text style={styles.helperText}>{timingLine}</Text>}

                <View style={styles.alarmRow}>
                  <SwitchRow icon="bell-ring-outline" label="Alarm sound" value={alarm} onChange={setAlarm} />
                  <Text style={styles.helperText}>
                    Plays a sound when it is time. Follows your phone&apos;s volume and Do Not Disturb settings.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* pinned actions, outside the scroll view */}
        <View style={styles.footer}>
          <Pressable
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            accessibilityRole="button">
            <Text style={styles.primaryText}>{isEdit ? 'Save changes' : 'Save habit'}</Text>
          </Pressable>
          {isEdit && (
            <Pressable
              style={({pressed}) => [styles.deleteButton, pressed && styles.pressed]}
              onPress={handleDelete}
              accessibilityRole="button">
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              <Text style={styles.deleteText}>Delete habit</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.lg},
  section: {marginTop: spacing.xl},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  labelGap: {marginBottom: spacing.sm},
  input: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {borderColor: colors.error},
  iconGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10},
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatRow: {flexDirection: 'row', gap: spacing.md},
  repeatPill: {flex: 1, height: 46, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  pillSelected: {backgroundColor: colors.accent},
  pillUnselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  repeatText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  whiteText: {color: colors.white},
  dayRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md},
  dayChip: {width: 45, height: 39, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  dayText: {fontFamily: fonts.bold, fontSize: 11, color: colors.muted},
  errorText: {fontFamily: fonts.medium, fontSize: 12, color: colors.error, marginTop: spacing.sm},
  errorColor: {color: colors.error},
  helperText: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: spacing.sm},
  reminderBody: {marginTop: spacing.md},
  subLabel: {marginTop: spacing.lg, marginBottom: spacing.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {height: 40, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted},
  alarmRow: {marginTop: spacing.lg},
  note: {
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noteText: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  noteLink: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.accent},
  footer: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  deleteButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.error + '14', // ~8% opacity
    borderWidth: 1,
    borderColor: colors.error + '73', // ~45% opacity
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  deleteText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.error},
  pressed: {opacity: 0.85},
});
