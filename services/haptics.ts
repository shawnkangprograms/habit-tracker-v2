import * as Haptics from 'expo-haptics';

// Success haptic for celebrations (level up, streak milestone, perfect day). Android uses the haptics API
// the SDK 57 docs recommend over the vibrator. Never throws.
export function successHaptic(): void {
  if (process.env.EXPO_OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}
