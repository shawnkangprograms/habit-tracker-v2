import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {CHOOSE_CARD_BUTTON, CHOOSE_CARD_LATER, CHOOSE_CARD_TITLE, chooseCardBody} from '@/utils/packs/copy';

// Home's "Choose your habit packs" card (docs/PACKS_REPORTS_SPEC.md, section 3) for users with habits and no
// packs. "Choose packs" opens the picker; "Not now" hides the card on this phone (Settings > Habit packs still
// opens the picker). {n} is the pack limit for the user's level.
export function ChoosePacksCard(props: {limit: number; onChoose: () => void; onLater: () => void}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="view-grid-plus-outline" size={22} color={colors.accent} />
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">{CHOOSE_CARD_TITLE}</Text>
          <Text style={styles.body}>{chooseCardBody(props.limit)}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable
          style={({pressed}) => [styles.primary, pressed && styles.pressed]}
          onPress={props.onChoose}
          accessibilityRole="button">
          <Text style={styles.primaryText}>{CHOOSE_CARD_BUTTON}</Text>
        </Pressable>
        <Pressable
          style={({pressed}) => [styles.secondary, pressed && styles.pressed]}
          onPress={props.onLater}
          accessibilityRole="button">
          <Text style={styles.secondaryText}>{CHOOSE_CARD_LATER}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  text: {flex: 1, gap: 2},
  title: {fontFamily: fonts.title, fontSize: 15, color: colors.text},
  body: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  primary: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {fontFamily: fonts.title, fontSize: 14, color: colors.white},
  secondary: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  pressed: {opacity: 0.85},
});
