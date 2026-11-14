import {useCallback, useRef, useState, type ReactNode} from 'react';
import {router, useFocusEffect} from 'expo-router';
import Constants from 'expo-constants';
import {Alert, AppState, Linking, StyleSheet, View} from 'react-native';
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
import {spacing} from '@/constants/theme';
import {TEST_IDS, nudgeTimeId} from '@/constants/testIds';
import {SwitchRow} from '@/components/switch-row';
import {AppText} from '@/components/ui/app-text';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Pill} from '@/components/ui/pill';
import {Row} from '@/components/ui/row';
import {Screen} from '@/components/ui/screen';
import {
    ADMIN_ROW, CELEBRATIONS_ROW, EVENING_NUDGE_ROW, HABIT_REMINDERS_ROW, NUDGE_TIME_GROUP_LABEL, OPEN_PHONE_SETTINGS_BUTTON,
    PHONE_NOTIFICATIONS_OFF_NOTICE, REMINDERS_UNAVAILABLE_NOTICE, SECTION_ACCOUNT, SECTION_PLAN, SECTION_REMINDERS,
    YOU_TITLE, SIGN_OUT_FAILED_MESSAGE, SIGN_OUT_FAILED_TITLE, SIGN_OUT_ROW, TEST_FAILED_LINE, TEST_NOTIFICATION_HINT,
    TEST_NOTIFICATION_ROW, TEST_SENT_LINE,
} from '@/utils/copy/settings';
import {TRACE_ON} from '@/utils/startupTrace';
import {firstPullFor} from '@/sync/syncEngine';// S-4: read-only
import {RESTORING_LINE} from '@/utils/firstPull';
import {SETTINGS_ROW} from '@/utils/onboarding/copy';
import {NAME_ROW} from '@/utils/profileName';
import {SETTINGS_PACKS_ROW} from '@/utils/packs/copy';
import {useSyncLines} from '@/hooks/use-clock-line';// S-1 and R-1: the only sync messages, here only

// DEV ONLY: long-press the title to seed early-praise history (logs first, a second long press confirms)
const devSeed = devSeedEarlyPraise;
const onTitleLongPress = devSeed
    ? () => { devSeed(getSessionUid()); }
    : undefined;

// Sign-out is refused only if the sign-in marker can't be cleared (services/authActions.js); nothing changes then
function handleSignOut() {
    signOut().catch((err: unknown) => {
        console.log('Sign-out failed', err);
        Alert.alert(SIGN_OUT_FAILED_TITLE, SIGN_OUT_FAILED_MESSAGE);
    });
}

// "Version 1.0.0 (build 2)": app.json's version and Android versionCode (iOS buildNumber; no build part if unset)
const appConfig = Constants.expoConfig;
const buildNumber = appConfig?.android?.versionCode ?? appConfig?.ios?.buildNumber;
const VERSION_LINE = `Version ${appConfig?.version ?? '?'}${buildNumber != null ? ` (build ${buildNumber})` : ''}`;

// Preview build only: a long press on the version line shows the startup trace (never shown by default)
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only in a trace build
const StartupTracePanel = TRACE_ON ? (require('@/components/startup-trace-panel') as typeof import('@/components/startup-trace-panel')).StartupTracePanel : null;

export default function YouScreen (){
    const {isAdmin, recheckIfFailed} = useIsAdmin();
    const celebrationsOn = useCelebrationsEnabled();
    const notificationPrefs = useNotificationPrefs();
    const syncMessages = useSyncLines();
    const [permission, setPermission] = useState<PermissionState | null>(null);
    const [asking, setAsking] = useState(false);
    const [available] = useState(notificationsAvailable);// fixed for the app run: the module loads once or never
    const [showTrace, setShowTrace] = useState(false);// resets on every launch (never saved)

    // S-4: the plan retake creates templates, so it waits for this uid's first pull (utils/firstPull.ts). One open
    // at a time; the line clears on the next tap that opens it.
    const [planNotice, setPlanNotice] = useState<string | null>(null);
    const openingPlan = useRef(false);
    const openPlan = async () => {
        const uid = getSessionUid();
        if (!uid || openingPlan.current) return;
        openingPlan.current = true;
        try {
            const result = await firstPullFor(uid);
            if (result !== 'done') {
                setPlanNotice(RESTORING_LINE);
                return;
            }
            setPlanNotice(null);
            router.push({pathname: '/onboarding', params: {entry: 'settings'}});
        } finally {
            openingPlan.current = false;
        }
    };

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
        <Screen testID={TEST_IDS.settings.screen} padding={spacing.lg} gap={spacing.lg} contentStyle={styles.content}>
              <AppText variant="title" style={styles.title} onLongPress={onTitleLongPress}>{YOU_TITLE}</AppText>
              {syncMessages.map((line) => <AppText key={line} variant="small" color="muted" style={styles.clockLine}>{line}</AppText>)}

              <Section title={SECTION_REMINDERS}>
                <SwitchRow
                  icon="party-popper"
                  label={CELEBRATIONS_ROW}
                  value={celebrationsOn}
                  onChange={setCelebrationsEnabled}
                  testID={TEST_IDS.settings.celebrations}
                />
                <SwitchRow
                  icon="bell-outline"
                  label={HABIT_REMINDERS_ROW}
                  value={reminderSwitchValue(notificationPrefs, permission, available)}// the real state: off while the phone blocks notifications
                  onChange={(value) => setNotificationSwitch('remindersOn', value)}
                  disabled={asking || !available}
                  testID={TEST_IDS.settings.reminders}
                />
                <SwitchRow
                  icon="weather-night"
                  label={EVENING_NUDGE_ROW}
                  value={available && notificationPrefs.nudgeOn}
                  onChange={(value) => setNotificationSwitch('nudgeOn', value)}
                  disabled={asking || !available}
                  testID={TEST_IDS.settings.nudge}
                />

                {available && notificationPrefs.nudgeOn && (
                  <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={NUDGE_TIME_GROUP_LABEL}>
                    {NUDGE_TIMES.map((time) => {
                      const selected = notificationPrefs.nudgeTime === time;
                      return (
                        <Pill
                          key={time}
                          label={time}
                          selected={selected}
                          onPress={() => setNotificationPrefs({nudgeTime: time})}
                          gap={spacing.sm}
                          accessibilityLabel={time}
                          testID={nudgeTimeId(time)}
                        />
                      );
                    })}
                  </View>
                )}

                <Row
                  icon="send-outline"
                  label={TEST_NOTIFICATION_ROW}
                  onPress={sendTest}
                  disabled={!available || sendingTest}
                  dimmed={!available}
                  accessibilityLabel={TEST_NOTIFICATION_ROW}
                  accessibilityHint={TEST_NOTIFICATION_HINT}
                  accessibilityState={{disabled: !available || sendingTest}}
                  testID={TEST_IDS.settings.testNotification}
                />
                {testStatus && (
                  <AppText variant="caption" color="muted" style={styles.testLine} accessibilityLiveRegion="polite">
                    {testStatus === 'sent' ? TEST_SENT_LINE : TEST_FAILED_LINE}
                  </AppText>
                )}

                {!available && (
                  <Card gap={spacing.sm} padding={spacing.lg}>
                    <AppText variant="body" color="muted">{REMINDERS_UNAVAILABLE_NOTICE}</AppText>
                  </Card>
                )}

                {available && permission === 'denied' && (
                  <Card gap={spacing.sm} padding={spacing.lg}>
                    <AppText variant="body" color="muted">{PHONE_NOTIFICATIONS_OFF_NOTICE}</AppText>
                    <Button
                      label={OPEN_PHONE_SETTINGS_BUTTON}
                      size="sm"
                      onPress={() => { Linking.openSettings().catch(() => {}); }}
                      style={styles.noticeButton}
                      testID={TEST_IDS.settings.openPhoneSettings}
                    />
                  </Card>
                )}
              </Section>

              <Section title={SECTION_PLAN}>
                {/* first and last name, for the greeting on Home */}
                <Row
                  icon="account-edit-outline"
                  label={NAME_ROW}
                  onPress={() => router.push('/profile-name')}
                  chevron
                  testID={TEST_IDS.settings.nameRow}
                />

                {/* the built-in pack picker, for everyone (the same screen as Home's "Choose your habit packs") */}
                <Row
                  icon="view-grid-outline"
                  label={SETTINGS_PACKS_ROW}
                  onPress={() => router.push({pathname: '/packs/choose', params: {from: 'settings'}})}
                  chevron
                  testID={TEST_IDS.settings.packsRow}
                />

                {/* onboarding for everyone, any time: never opens on its own for users who already have habits.
                    S-4: it opens only once this uid's first pull is done; until then the tap shows the line below */}
                <Row
                  icon="compass-outline"
                  label={SETTINGS_ROW}
                  onPress={openPlan}
                  chevron
                  testID={TEST_IDS.settings.planRow}
                />
                {planNotice ? (
                  <Card gap={spacing.sm} padding={spacing.lg}>
                    <AppText variant="body" color="muted" accessibilityLiveRegion="polite">{planNotice}</AppText>
                  </Card>
                ) : null}
              </Section>

              <Section title={SECTION_ACCOUNT}>
                {isAdmin && (
                  <Row
                    icon="shield-account-outline"
                    label={ADMIN_ROW}
                    onPress={() => router.push('/admin/overview')}
                    chevron
                    testID={TEST_IDS.settings.adminRow}
                  />
                )}

                <Row
                  icon="logout"
                  label={SIGN_OUT_ROW}
                  onPress={handleSignOut}
                  tone="danger"
                  testID={TEST_IDS.settings.signOut}
                />
              </Section>

              <AppText
                variant="caption"
                color="muted"
                style={styles.version}
                onLongPress={StartupTracePanel ? () => setShowTrace((shown) => !shown) : undefined}>
                {VERSION_LINE}
              </AppText>
              {StartupTracePanel && showTrace && <StartupTracePanel />}
        </Screen>
    )
}

// A titled block of rows: a small header (the header role for screen readers) over a list with the rows' 7 dp gap
function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <View style={styles.section}>
      <AppText variant="label" color="muted" accessibilityRole="header">{title}</AppText>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.s18},
  title: {paddingTop: spacing.s5},
  section: {gap: spacing.sm},
  list: {gap: spacing.s7},
  testLine: {paddingHorizontal: spacing.xs},
  clockLine: {marginTop: -spacing.sm},// S-1; wraps freely
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xs},
  noticeButton: {alignSelf: 'flex-start'},
  version: {textAlign: 'center'},
});
