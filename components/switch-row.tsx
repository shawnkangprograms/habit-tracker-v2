import type {ComponentProps} from 'react';
import {Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// One row with a switch (Settings, the habit form). The whole row is the control: tapping anywhere toggles,
// and screen readers get one "switch" with its label and on/off state (the inner Switch is hidden from them).
// At least 56 dp tall. The switch sits in a fixed, centred box, so the row lays out the same whatever size
// the native switch reports.
export function SwitchRow({icon, label, value, onChange, disabled}: {
  icon: IconName;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({pressed}) => [styles.row, pressed && !disabled && styles.pressed]}
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{checked: value, disabled: !!disabled}}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
      <Text style={styles.rowText}>{label}</Text>
      <View style={styles.switchBox} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{false: colors.border, true: colors.accent}}
          thumbColor={colors.white}
          ios_backgroundColor={colors.border}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, // only shows when large text makes a row taller than 56
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  switchBox: {width: 52, height: 32, alignItems: 'center', justifyContent: 'center'},
  pressed: {opacity: 0.85},
});
