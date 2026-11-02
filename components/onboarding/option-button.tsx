import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// One onboarding answer row: a dark rounded card with a radio (single) or checkbox (multi). Selected: orange
// outline and tint. Dimmed: a multi question is at its limit, so this unpicked row can't be picked.
export function OptionButton({label, selected, multi, dimmed = false, onPress}: {
  label: string;
  selected: boolean;
  multi: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={dimmed}
      style={({pressed}) => [styles.row, selected && styles.rowSelected, dimmed && styles.dimmed, pressed && styles.pressed]}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? {checked: selected, disabled: dimmed} : {selected, disabled: dimmed}}
      accessibilityLabel={label}>
      <View style={[multi ? styles.checkbox : styles.radio, selected && styles.markOn]}>
        {selected && (multi
          ? <MaterialCommunityIcons name="check" size={15} color={colors.white} />
          : <View style={styles.dot} />)}
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const MARK = 22;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: {borderColor: colors.accent, backgroundColor: colors.accent + '1f'}, // ~12% tint
  dimmed: {opacity: 0.45},
  pressed: {opacity: 0.85},
  radio: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: MARK,
    height: MARK,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: {borderColor: colors.accent, backgroundColor: colors.accent},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white},
  label: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  labelSelected: {color: colors.text},
});
