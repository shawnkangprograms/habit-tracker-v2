import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeIn} from 'react-native-reanimated';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// Home's first-run card for a user with no active habits: one clear action, to the New habit screen and its
// starter ideas. Fades in only when Reduce Motion is off.
export function EmptyHomeCard({reduceMotion, onPick}: {reduceMotion: boolean; onPick: () => void}) {
  return (
    <Animated.View style={styles.card} entering={reduceMotion ? undefined : FadeIn.duration(250)}>
      <View style={styles.badge}>
        <MaterialCommunityIcons name="fire" size={26} color={colors.accent} />
      </View>
      <Text style={styles.title} accessibilityRole="header">Start with one small habit</Text>
      <Text style={styles.body}>Pick a starter habit and tick it off today. Small steps build streaks.</Text>
      <Pressable
        style={({pressed}) => [styles.button, pressed && styles.pressed]}
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel="Pick a starter habit"
        accessibilityHint="Opens the new habit screen with starter ideas">
        <Text style={styles.buttonText}>Pick a starter habit</Text>
      </Pressable>
    </Animated.View>
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
  buttonText: {fontFamily: fonts.title, fontSize: 16, color: colors.white, textAlign: 'center'},
  pressed: {opacity: 0.85},
});
