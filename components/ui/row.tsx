import type {ComponentProps, ReactNode} from 'react';
import {Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {colors} from '@/constants/theme';
import {ROW, rowStyle} from '@/utils/ui/controls';
import {AppText} from '@/components/ui/app-text';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// A list row (Settings, and SwitchRow's switch rows): an accent icon, a label, optional trailing content (a switch) and
// an optional chevron. 56 dp tall, so above the 48 dp target. The whole row is the control. Role defaults to "button";
// every accessibility prop and testID passes straight through, and none is added (no label unless given: a screen
// reader reads the visible text). Pressed = opacity 0.85 (not animated, so nothing to switch off for "reduce motion").
// tone "danger" paints the icon and the label red (Sign Out). `dimmed` is the look of an unavailable row (opacity 0.5).
export function Row({icon, label, onPress, chevron = false, trailing, tone = 'default', disabled, dimmed = false, style, testID,
  accessibilityRole = 'button', accessibilityLabel, accessibilityHint, accessibilityState}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  chevron?: boolean;
  trailing?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;// from constants/testIds.ts
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: PressableProps['accessibilityState'];
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      style={({pressed}) => [styles.row, dimmed && styles.dimmed, style, pressed && !disabled && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      testID={testID}>
      <MaterialCommunityIcons name={icon} size={ROW.iconSize} color={danger ? colors.error : colors.accent} />
      <AppText variant="bodyLg" weight="semiBold" color={danger ? 'error' : 'text'} style={styles.label}>{label}</AppText>
      {trailing}
      {chevron ? <MaterialCommunityIcons name="chevron-right" size={ROW.iconSize} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: rowStyle(),
  label: {flex: 1},
  dimmed: {opacity: ROW.dimmedOpacity},
  pressed: {opacity: ROW.pressedOpacity},
});
