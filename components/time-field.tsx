import {Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {dateToTime, timeToDate} from '@/utils/reminderForm';

// The habit form's reminder time. The value is always an "HH:MM" string (the validators stay the source of
// truth); the native picker only edits it. Android: a button that opens the system time dialog (24 h).
// iOS: the compact inline picker, in a 24 h locale.
//
// @react-native-community/datetimepicker is included in Expo Go (SDK 57 docs), but it is required lazily
// inside a try/catch, like expo-notifications: if this app binary lacks the native module, the form falls back
// to the HH:MM text field instead of crashing.

type PickerModule = typeof import('@react-native-community/datetimepicker');

let picker: PickerModule | null | undefined;
function loadPicker(): PickerModule | null {
  if (picker === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be a lazy require (see above)
      picker = require('@react-native-community/datetimepicker') as PickerModule;
    } catch (err) {
      picker = null;
      if (__DEV__) console.log('Time picker unavailable in this app binary, using the text field', err);
    }
  }
  return picker;
}

export function TimeField({value, onChange, error}: {
  value: string;
  onChange: (time: string) => void;
  error?: boolean;
}) {
  const mod = loadPicker();

  if (!mod) {
    return (
      <View style={[styles.field, error && styles.fieldError]}>
        <MaterialCommunityIcons name="clock-outline" size={20} color={colors.muted} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="HH:MM, e.g. 08:30"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          accessibilityLabel="Reminder time, 24-hour, like 08:30"
        />
      </View>
    );
  }

  if (Platform.OS === 'android') {
    const open = () => {
      try {
        mod.DateTimePickerAndroid.open({
          value: timeToDate(value),
          mode: 'time',
          is24Hour: true,
          onValueChange: (_event, date) => onChange(dateToTime(date)),
        });
      } catch (err) {
        console.log('Opening the time picker failed', err);
      }
    };
    return (
      <Pressable
        style={({pressed}) => [styles.field, error && styles.fieldError, pressed && styles.pressed]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Reminder time, ${value}`}
        accessibilityHint="Opens the time picker">
        <MaterialCommunityIcons name="clock-outline" size={20} color={colors.muted} />
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.change}>Change</Text>
      </Pressable>
    );
  }

  const Picker = mod.default;
  return (
    <View style={[styles.field, error && styles.fieldError]}>
      <MaterialCommunityIcons name="clock-outline" size={20} color={colors.muted} />
      <Text style={styles.label}>Time</Text>
      <Picker
        value={timeToDate(value)}
        mode="time"
        display="compact"
        locale="en_GB"
        themeVariant="dark"
        accentColor={colors.accent}
        onValueChange={(_event, date) => onChange(dateToTime(date))}
        accessibilityLabel="Reminder time"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
  },
  fieldError: {borderColor: colors.error},
  input: {flex: 1, height: 54, fontFamily: fonts.regular, fontSize: 14, color: colors.text},
  value: {flex: 1, fontFamily: fonts.semiBold, fontSize: 16, color: colors.text},
  change: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.accent},
  label: {flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text},
  pressed: {opacity: 0.85},
});
