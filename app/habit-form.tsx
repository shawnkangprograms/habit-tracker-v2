import {useState, useEffect, useRef} from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {addHabit, getHabit, softDeleteHabit, updateHabit} from '@/db/habits';
import {getFirebaseAuth} from '@/services/authInit';
import {ICON_IDS, type Frequency, type IconId, type WeekdayKey} from '@/constants/habits';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {
  validateFrequency, validateHabitInput, validateHabitName, validateIcon, validateReminderTime,
} from '@/validation/validators';

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
  const [reminder, setReminder] = useState('');
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
        setReminder(habit.reminderTime ?? '');
        setIsLoaded(true);
      })
      .catch((err: unknown) => {
        Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.', [{text: 'OK', onPress: goBack}]);
      });
  }, [userId, habitId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const clearError = (field: keyof FieldErrors) => setErrors((e) => ({...e, [field]: undefined}));

  const toggleDay = (day: WeekdayKey) => {
    setSelectedDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
    clearError('frequency');
  };

  const handleSave = async () => {
    if (savingRef.current) return; // ignore extra taps while saving

    const reminderTime = reminder.trim() === '' ? null : reminder.trim(); // empty = no reminder
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

    const input = validateHabitInput({habitName, icon, frequency, reminderTime});
    if (!input.valid || !userId) return;

    savingRef.current = true;
    try {
      if (habitId) await updateHabit(userId, habitId, input.value);
      else await addHabit(userId, input.value);
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

          {/* REMINDER */}
          <View style={styles.section}>
            <Text style={[styles.label, styles.labelGap]}>REMINDER (OPTIONAL)</Text>
            <View style={[styles.input, styles.inputRow, errors.reminder && styles.inputError]}>
              <MaterialCommunityIcons name="clock-outline" size={20} color={colors.muted} />
              <TextInput
                style={styles.inputInner}
                value={reminder}
                onChangeText={(text) => { setReminder(text); clearError('reminder'); }}
                placeholder="HH:MM, e.g. 08:30"
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
              />
            </View>
            {errors.reminder
              ? <Text style={styles.errorText}>{errors.reminder}</Text>
              : <Text style={styles.helperText}>24-hour time. Leave empty for no reminder.</Text>}
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
  inputRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  inputInner: {flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 14, color: colors.text},
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
