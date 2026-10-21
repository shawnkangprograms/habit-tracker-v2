import {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeIn, FadeOut, ReduceMotion} from 'react-native-reanimated';
import {setNotificationPrefs} from '@/services/notificationPrefs';
import {requestNotificationPermission} from '@/services/notifications';
import {colors, fonts, radii, spacing} from '@/constants/theme';

const LATER_MS = 2500;

// One-time soft prompt on Home (after a completing tick): "Want a gentle evening reminder?"
// Any answer sets softPromptDone, so it never comes back. Turn on asks for permission and enables the nudge;
// if permission is denied, the card says where to turn it on later and closes (Settings explains the rest).
export function ReminderPrompt({onClose}: {onClose: () => void}) {
  const [state, setState] = useState<'ask' | 'busy' | 'later'>('ask');

  useEffect(() => {
    if (state !== 'later') return;
    const timer = setTimeout(onClose, LATER_MS);
    return () => clearTimeout(timer);
  }, [state, onClose]);

  const turnOn = async () => {
    setState('busy');
    const granted = await requestNotificationPermission();
    if (granted) {
      await setNotificationPrefs({nudgeOn: true, softPromptDone: true});
      onClose();
    } else {
      await setNotificationPrefs({softPromptDone: true});
      setState('later');
    }
  };

  const notNow = async () => {
    await setNotificationPrefs({softPromptDone: true});
    onClose();
  };

  return (
    <Animated.View
      style={styles.card}
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="weather-night" size={20} color={colors.accent} />
        <Text style={styles.text}>
          {state === 'later' ? 'You can turn this on later in Settings.' : 'Want a gentle evening reminder?'}
        </Text>
      </View>
      {state !== 'later' && (
        <View style={styles.buttons}>
          <Pressable
            style={({pressed}) => [styles.secondary, pressed && styles.pressed]}
            onPress={notNow}
            disabled={state === 'busy'}
            accessibilityRole="button">
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.primary, pressed && styles.pressed]}
            onPress={turnOn}
            disabled={state === 'busy'}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Turn on</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.accent + '54',
    backgroundColor: colors.surface,
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  text: {flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
  buttons: {flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm},
  primary: {
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {fontFamily: fonts.title, fontSize: 14, color: colors.white},
  secondary: {height: 38, paddingHorizontal: spacing.lg, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  secondaryText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  pressed: {opacity: 0.85},
});
