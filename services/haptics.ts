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

// A light tick when a choice changes (onboarding answers, the confidence slider, routine cards). Android uses
// Clock_Tick, which every Android version supports (Segment_Tick needs API 34). Follows the phone's touch
// feedback setting. Never throws.
export function selectionHaptic(): void {
  if (process.env.EXPO_OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
}
