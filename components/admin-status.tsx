import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type Props =
  | {kind: 'loading'}
  | {kind: 'offline' | 'denied' | 'error'; message: string; onRetry: () => void};

const ICONS = {offline: 'wifi-off', denied: 'lock-outline', error: 'alert-circle-outline'} as const;

// Loading / offline / error panel shared by the admin screens
export function AdminStatus(props: Props) {
  if (props.kind === 'loading') {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <MaterialCommunityIcons name={ICONS[props.kind]} size={28} color={colors.muted} />
      <Text style={styles.message}>{props.message}</Text>
      <Pressable
        style={({pressed}) => [styles.retry, pressed && styles.pressed]}
        onPress={props.onRetry}
        accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.largeCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  message: {fontFamily: fonts.regular, fontSize: 14, color: colors.text, textAlign: 'center'},
  retry: {
    height: 44,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {fontFamily: fonts.title, fontSize: 15, color: colors.white},
  pressed: {opacity: 0.85},
});
