import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {ADDED} from '@/utils/onboarding/copy';
import type {StarterPick} from '@/utils/onboarding/starters';

// One Recommended Routine card: the habit, its reason line, and a check. Tapping toggles it; a card already
// created this run shows "Added" and can't be toggled. Styled like Home's habit cards.
export function RoutineCard({pick, selected, added, disabled, onToggle}: {
  pick: StarterPick;
  selected: boolean;
  added: boolean;
  disabled: boolean;// while habits are being created
  onToggle: () => void;
}) {
  const tint = ICON_COLORS[pick.icon] ?? colors.accent;
  const on = selected || added;
  return (
    <Pressable
      onPress={onToggle}
      disabled={added || disabled}
      style={({pressed}) => [
        styles.card,
        on ? {backgroundColor: `${tint}14`, borderColor: `${tint}54`} : styles.off,
        pressed && styles.pressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{checked: on, disabled: added || disabled}}
      accessibilityLabel={`${pick.habitName}. ${pick.reason}${added ? `. ${ADDED}` : ''}`}>
      <View style={[styles.badge, {backgroundColor: `${tint}30`, borderColor: `${tint}80`}, !on && styles.faded]}>
        <HabitIcon id={pick.icon} size={21} color={tint} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.name, !on && styles.faded]} numberOfLines={1}>{pick.habitName}</Text>
        <Text style={[styles.reason, !on && styles.faded]}>{pick.reason}</Text>
      </View>
      {added ? (
        <Text style={styles.added}>{ADDED}</Text>
      ) : (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected && <MaterialCommunityIcons name="check" size={15} color={colors.white} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
  },
  off: {backgroundColor: colors.surface, borderColor: colors.border},
  pressed: {opacity: 0.85},
  badge: {width: 38, height: 38, borderRadius: radii.iconBadge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  text: {flex: 1, gap: 2},
  name: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  reason: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  faded: {opacity: 0.5},
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {borderColor: colors.accent, backgroundColor: colors.accent},
  added: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.green},
});
