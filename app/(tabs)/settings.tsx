import {useCallback, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import Constants from 'expo-constants';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {signOut} from '@/services/authActions';
import {useIsAdmin} from '@/services/adminContext';
import {getSessionUid} from '@/services/session';
import {setCelebrationsEnabled, useCelebrationsEnabled} from '@/services/celebrationPrefs';
import {setNotificationPrefs, useNotificationPrefs} from '@/services/notificationPrefs';
import {
    getNotificationPermission, notificationsAvailable, requestNotificationPermission, sendTestNotification,
    type PermissionState,
} from '@/services/notifications';
import {NUDGE_TIMES, reminderSwitchValue} from '@/utils/notificationPrefs';
import {devSeedEarlyPraise} from '@/db/devSeed';// null outside __DEV__
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {SwitchRow} from '@/components/switch-row';
import {TRACE_ON} from '@/utils/startupTrace';

// DEV ONLY: long-press the title to seed early-praise history (logs first, a second long press confirms)
const devSeed = devSeedEarlyPraise;
const onTitleLongPress = devSeed
    ? () => { devSeed(getSessionUid()); }
    : undefined;

// Sign-out is refused only if the sign-in marker can't be cleared (services/authActions.js); nothing changes then
function handleSignOut() {
    signOut().catch((err: unknown) => {
        console.log('Sign-out failed', err);
        Alert.alert("Couldn't sign out", 'Please try again.');
    });
}

// "Version 1.0.0 (build 2)": app.json's version and Android versionCode (iOS buildNumber; no build part if unset)
const appConfig = Constants.expoConfig;
const buildNumber = appConfig?.android?.versionCode ?? appConfig?.ios?.buildNumber;
const VERSION_LINE = `Version ${appConfig?.version ?? '?'}${buildNumber != null ? ` (build ${buildNumber})` : ''}`;

// Preview build only: a long press on the version line shows the startup trace (never shown by default)
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only in a trace build
const StartupTracePanel = TRACE_ON ? (require('@/components/startup-trace-panel') as typeof import('@/components/startup-trace-panel')).StartupTracePanel : null;

export default function SettingsScreen (){
    const {isAdmin, recheckIfFailed} = useIsAdmin();
    const celebrationsOn = useCelebrationsEnabled();
    const notificationPrefs = useNotificationPrefs();
    const [permission, setPermission] = useState<PermissionState | null>(null);
    const [asking, setAsking] = useState(false);
    const [available] = useState(notificationsAvailable);// fixed for the app run: the module loads once or never
    const [showTrace, setShowTrace] = useState(false);// resets on every launch (never saved)

    // if the sign-in admin check failed for a network reason, try again whenever Settings gains focus.
    // Notification permission is re-checked on focus and when coming back from the phone's settings.
    useFocusEffect(useCallback(() => {
        recheckIfFailed();
        getNotificationPermission().then(setPermission);
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') getNotificationPermission().then(setPermission);
        });
        return () => sub.remove();
    }, [recheckIfFailed]));

    // Turning a notification switch on asks for permission (never at launch); off needs nothing
    const setNotificationSwitch = async (key: 'remindersOn' | 'nudgeOn', value: boolean) => {
        if (!available) return;
        if (!value) {
            await setNotificationPrefs({[key]: false});
            return;
        }
        setAsking(true);
        try {
            const granted = await requestNotificationPermission();
            setPermission(granted ? 'granted' : await getNotificationPermission());
            if (granted) await setNotificationPrefs({[key]: true});
        } finally {
            setAsking(false);
        }
    };

    // "Send a test notification": asks for permission first if it was never asked (the usual flow); denied
    // shows the phone-settings notice below. Tapping again replaces the pending one. Never throws.
    const [testStatus, setTestStatus] = useState<'sent' | 'failed' | null>(null);
    const [sendingTest, setSendingTest] = useState(false);
    const sendTest = async () => {
        if (!available || sendingTest) return;
        setSendingTest(true);
        setTestStatus(null);
        try {
            let state = await getNotificationPermission();
            if (state === 'undetermined') {
                state = (await requestNotificationPermission()) ? 'granted' : await getNotificationPermission();
            }
            setPermission(state);
            if (state !== 'granted') return;// 'denied': the notice with "Open settings" shows
            setTestStatus((await sendTestNotification()) ? 'sent' : 'failed');
        } catch {
            setTestStatus('failed');
        } finally {
            setSendingTest(false);
        }
    };

    return(
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title} onLongPress={onTitleLongPress}>Settings</Text>

              <View style={styles.list}>
                <SwitchRow
                  icon="party-popper"
                  label="Celebrations and messages"
                  value={celebrationsOn}
                  onChange={setCelebrationsEnabled}
                />
                <SwitchRow
                  icon="bell-outline"
                  label="Habit reminders"
                  value={reminderSwitchValue(notificationPrefs, permission, available)}// the real state: off while the phone blocks notifications
                  onChange={(value) => setNotificationSwitch('remindersOn', value)}
                  disabled={asking || !available}
                />
                <SwitchRow
                  icon="weather-night"
                  label="Evening nudge"
                  value={available && notificationPrefs.nudgeOn}
                  onChange={(value) => setNotificationSwitch('nudgeOn', value)}
                  disabled={asking || !available}
                />

                {available && notificationPrefs.nudgeOn && (
                  <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Evening nudge time">
                    {NUDGE_TIMES.map((time) => {
                      const selected = notificationPrefs.nudgeTime === time;
                      return (
                        <Pressable
                          key={time}
                          style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                          onPress={() => setNotificationPrefs({nudgeTime: time})}
                          accessibilityRole="radio"
                          accessibilityState={{selected}}>
                          <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{time}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Pressable
                  style={({pressed}) => [styles.row, !available && styles.disabledRow, pressed && available && styles.pressed]}
                  onPress={sendTest}
                  disabled={!available || sendingTest}
                  accessibilityRole="button"
                  accessibilityLabel="Send a test notification"
                  accessibilityHint="Arrives in about 10 seconds"
                  accessibilityState={{disabled: !available || sendingTest}}>
                  <MaterialCommunityIcons name="send-outline" size={22} color={colors.accent} />
                  <Text style={styles.rowText}>Send a test notification</Text>
                </Pressable>
                {testStatus && (
                  <Text style={styles.testLine} accessibilityLiveRegion="polite">
                    {testStatus === 'sent'
                      ? 'Sent. It arrives in about 10 seconds. Lock your phone to see it as a lock-screen notification.'
                      : "Couldn't send the test notification."}
                  </Text>
                )}

                {!available && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>Reminders aren&apos;t available in this version of the app on this phone yet.</Text>
                  </View>
                )}

                {available && permission === 'denied' && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>Notifications are turned off for HabitQuest in your phone settings.</Text>
                    <Pressable
                      style={({pressed}) => [styles.noticeButton, pressed && styles.pressed]}
                      onPress={() => { Linking.openSettings().catch(() => {}); }}
                      accessibilityRole="button">
                      <Text style={styles.noticeButtonText}>Open settings</Text>
                    </Pressable>
                  </View>
                )}

                {isAdmin && (
                  <Pressable
                    style={({pressed}) => [styles.row, pressed && styles.pressed]}
                    onPress={() => router.push('/admin/overview')}
                    accessibilityRole="button">
                    <MaterialCommunityIcons name="shield-account-outline" size={22} color={colors.accent} />
                    <Text style={styles.rowText}>Admin</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
                  </Pressable>
                )}

                <Pressable
                  style={({pressed}) => [styles.row, pressed && styles.pressed]}
                  onPress={handleSignOut}
                  accessibilityRole="button">
                  <MaterialCommunityIcons name="logout" size={22} color={colors.error} />
                  <Text style={[styles.rowText, styles.signOutText]}>Sign Out</Text>
                </Pressable>
              </View>

              <Text
                style={styles.version}
                onLongPress={StartupTracePanel ? () => setShowTrace((shown) => !shown) : undefined}>
                {VERSION_LINE}
              </Text>
              {StartupTracePanel && showTrace && <StartupTracePanel />}
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: 18, gap: spacing.lg},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, paddingTop: 5},
  list: {gap: 7},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, // only shows when large text makes a row taller than 56
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  disabledRow: {opacity: 0.5},
  testLine: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, paddingHorizontal: spacing.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xs},
  chip: {height: 34, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipSelected: {backgroundColor: colors.accent},
  chipUnselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  chipText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted},
  chipTextSelected: {color: colors.white},
  notice: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeText: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  noticeButton: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeButtonText: {fontFamily: fonts.title, fontSize: 14, color: colors.white},
  signOutText: {color: colors.error},
  version: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center'},
  pressed: {opacity: 0.85},
});
