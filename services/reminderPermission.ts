import {loadNotificationPrefs} from '@/services/notificationPrefs';
import {getNotificationPermission, notificationsAvailable, requestNotificationPermission} from '@/services/notifications';
import {shouldAskOnReminderSave} from '@/utils/notificationPrefs';

// After saving habits with a reminder time (the habit form and onboarding's routine): the in-context permission
// request (Android 13+ and iOS), only while reminders are on and the app has never asked. Never at launch.
// Never throws; a denial or a failure just leaves reminders silent.
export async function askForReminderPermission(): Promise<void> {
  if (!notificationsAvailable()) return;
  try {
    const [prefs, current] = await Promise.all([loadNotificationPrefs(), getNotificationPermission()]);
    if (shouldAskOnReminderSave(prefs, current)) await requestNotificationPermission();
  } catch (err) {
    console.log('Asking for notification permission failed', err);
  }
}
