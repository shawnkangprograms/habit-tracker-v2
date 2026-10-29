import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';

const COPY = {
  noHabits: {
    title: 'Your progress will show up here',
    body: 'Add a habit and tick it off. Each day you finish fills in this page.',
  },
  nothingScheduled: {
    title: 'Nothing was scheduled in this range yet',
    body: 'Your habits are due on other days. Try the other range, or add a habit for these days.',
  },
} as const;

// Summary's empty state, styled like Home's first-run card: friendly copy and one action, no chart frames.
// No entrance animation (the tab should open instantly on low-end phones).
export function SummaryEmptyCard({kind, onCreate}: {kind: keyof typeof COPY; onCreate: () => void}) {
  const copy = COPY[kind];
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <MaterialCommunityIcons name="chart-bar" size={26} color={colors.accent} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable
        style={({pressed}) => [styles.button, pressed && styles.pressed]}
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Create a habit"
        accessibilityHint="Opens the new habit screen">
        <Text style={styles.buttonText}>Create a habit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent + '26', // ~15% opacity, like the level badge
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {fontFamily: fonts.title, fontSize: 20, color: colors.text, textAlign: 'center'},
  body: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center'},
  button: {
    alignSelf: 'stretch',
    minHeight: 52, // above the 48 dp minimum touch target, also with large text
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.85},
  buttonText: {fontFamily: fonts.title, fontSize: 16, color: colors.white, textAlign: 'center'},
});
