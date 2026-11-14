import {Pressable, StyleSheet} from 'react-native';

import {colors} from '@/constants/theme';
import {PILL, hitSlopFor} from '@/utils/ui/controls';
import {AppText} from '@/components/ui/app-text';

// A selectable chip (Settings' evening-nudge times). Role "radio" by default, with its selected state announced.
// It is 34 dp tall; hitSlop lifts the touch area toward 48 dp, never past half of `gap` (the space to the next chip
// above or below), so neighbours don't overlap. The visible size changes in C2.
export function Pill({label, selected, onPress, role = 'radio', gap, testID, accessibilityLabel}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'button';
  gap?: number;
  testID?: string;// from constants/testIds.ts
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      style={[styles.pill, selected ? styles.selected : styles.unselected]}
      onPress={onPress}
      hitSlop={hitSlopFor(PILL.height, gap)}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{selected}}
      testID={testID}>
      <AppText variant="small" weight="semiBold" color={selected ? 'onAccent' : 'muted'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {height: PILL.height, paddingHorizontal: PILL.paddingHorizontal, borderRadius: PILL.borderRadius, alignItems: 'center', justifyContent: 'center'},
  selected: {backgroundColor: colors.accent},
  unselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
});
