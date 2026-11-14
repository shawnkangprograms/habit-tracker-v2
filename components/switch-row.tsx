import type {ComponentProps} from 'react';
import {StyleSheet, Switch, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors} from '@/constants/theme';
import {SWITCH_BOX} from '@/utils/ui/controls';
import {Row} from '@/components/ui/row';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// One row with a switch (Settings, the habit form). The whole row is the control: tapping anywhere toggles,
// and screen readers get one "switch" with its label and on/off state (the inner Switch is hidden from them).
// At least 56 dp tall. The switch sits in a fixed, centred box, so the row lays out the same whatever size
// the native switch reports. Built on the shared Row (C2); it looks and behaves as before (tests/ui-row.test.ts).
export function SwitchRow({icon, label, value, onChange, disabled, testID}: {
  icon: IconName;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;// from constants/testIds.ts
}) {
  return (
    <Row
      icon={icon}
      label={label}
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      testID={testID}
      accessibilityLabel={label}
      accessibilityState={{checked: value, disabled: !!disabled}}
      trailing={
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
      }
    />
  );
}

const styles = StyleSheet.create({
  switchBox: SWITCH_BOX,
});
