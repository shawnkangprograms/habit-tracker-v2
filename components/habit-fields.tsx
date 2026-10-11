import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {ICON_IDS, type IconId, type WeekdayKey} from '@/constants/habits';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';

// Form fields in the habit form's visual language, for the admin catalog form.
// A copy of the markup in app/habit-form.tsx, which is left untouched for now; unify later.

export const NAME_MAX = 30; // display only; validateHabitName enforces the limit

// Shown Mon to Sun; the keys are the stored WEEKDAY_KEYS values
const DAY_CHIPS: {key: WeekdayKey; label: string}[] = [
  {key: 'mon', label: 'M'}, {key: 'tue', label: 'T'}, {key: 'wed', label: 'W'}, {key: 'thu', label: 'T'},
  {key: 'fri', label: 'F'}, {key: 'sat', label: 'S'}, {key: 'sun', label: 'S'},
];

export function NameField({value, onChangeText, error, label = 'HABIT NAME', placeholder = 'e.g. Read 10 pages'}: {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  label?: string;
  placeholder?: string;
}) {
  const length = Array.from(value.trim()).length; // trimmed code points, as the validator counts
  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.label, length > NAME_MAX && styles.errorColor]}>{length}/{NAME_MAX}</Text>
      </View>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        returnKeyType="done"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function IconGrid({value, onChange, error}: {
  value: IconId | null;
  onChange: (id: IconId) => void;
  error?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.label, styles.labelGap]}>ICON</Text>
      <View style={styles.iconGrid}>
        {ICON_IDS.map((id) => {
          const selected = value === id;
          const tint = ICON_COLORS[id];
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              style={[styles.iconTile, selected && {borderWidth: 2, borderColor: tint, backgroundColor: tint + '30'}]}
              accessibilityRole="button"
              accessibilityLabel={id}
              accessibilityState={{selected}}>
              <HabitIcon id={id} size={24} color={selected ? tint : colors.muted} />
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function FrequencyPicker({isWeekdays, onChangeWeekdays, days, onToggleDay, error}: {
  isWeekdays: boolean;
  onChangeWeekdays: (weekdays: boolean) => void;
  days: WeekdayKey[];
  onToggleDay: (day: WeekdayKey) => void;
  error?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.label, styles.labelGap]}>REPEATS</Text>
      <View style={styles.repeatRow}>
        {[{weekdays: false, text: 'Every day'}, {weekdays: true, text: 'Specific days'}].map((option) => {
          const selected = isWeekdays === option.weekdays;
          return (
            <Pressable
              key={option.text}
              onPress={() => onChangeWeekdays(option.weekdays)}
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
            const selected = days.includes(key);
            return (
              <Pressable
                key={key}
                onPress={() => onToggleDay(key)}
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
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ReminderField({value, onChangeText, error}: {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.label, styles.labelGap]}>REMINDER (OPTIONAL)</Text>
      <View style={[styles.input, styles.inputRow, error && styles.inputError]}>
        <MaterialCommunityIcons name="clock-outline" size={20} color={colors.muted} />
        <TextInput
          style={styles.inputInner}
          value={value}
          onChangeText={onChangeText}
          placeholder="HH:MM, e.g. 08:30"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />
      </View>
      {error
        ? <Text style={styles.errorText}>{error}</Text>
        : <Text style={styles.helperText}>24-hour time. Leave empty for no reminder.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
