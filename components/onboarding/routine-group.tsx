import type {ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts, spacing} from '@/constants/theme';

// One group on the Recommended Routine screen: a pack's name (or "Other habits") over its cards. No motion of
// its own; the cards keep their stagger.
export function RoutineGroup({label, children}: {label: string; children: ReactNode}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label} accessibilityRole="header">{label}</Text>
      <View style={styles.cards}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {marginTop: spacing.md},
  label: {fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18, color: colors.muted},
  cards: {gap: spacing.sm, marginTop: spacing.sm},
});
