import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {SwitchRow} from '@/components/switch-row';
import {TimeField} from '@/components/time-field';
import {ROUTINE_REMINDER_LABEL} from '@/utils/onboarding/copy';
import {ROUTINE_TIME_CHOICES} from '@/utils/onboarding/plan';

// The routine's reminder: one switch (on by default) and one time, applied to every habit created. The native
// time picker when the app binary has it; otherwise fixed time chips, never TimeField's free-text fallback.
export function RoutineReminder({on, time, pickerAvailable, disabled, onToggle, onTime}: {
  on: boolean;
  time: string;// HH:MM
  pickerAvailable: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onTime: (time: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <SwitchRow icon="clock-outline" label={ROUTINE_REMINDER_LABEL} value={on} onChange={onToggle} disabled={disabled} />
      {on && (pickerAvailable ? (
        <TimeField value={time} onChange={onTime} />
      ) : (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={ROUTINE_REMINDER_LABEL}>
          {ROUTINE_TIME_CHOICES.map((choice) => {
            const selected = time === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => onTime(choice)}
                disabled={disabled}
                style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
                accessibilityRole="radio"
                accessibilityState={{selected}}>
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{choice}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.md},
  chips: {flexDirection: 'row', gap: spacing.sm},
  chip: {height: 40, paddingHorizontal: 16, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipOn: {backgroundColor: colors.accent},
  chipOff: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  chipText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted},
  chipTextOn: {color: colors.white},
});
