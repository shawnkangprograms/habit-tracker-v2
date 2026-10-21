import {useCallback, useState, type ComponentProps} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {signOut} from '@/services/authActions';
import {useIsAdmin} from '@/services/adminContext';
import {getFirebaseAuth} from '@/services/authInit';
import {setCelebrationsEnabled, useCelebrationsEnabled} from '@/services/celebrationPrefs';
import {setNotificationPrefs, useNotificationPrefs} from '@/services/notificationPrefs';
import {
    getNotificationPermission, notificationsAvailable, requestNotificationPermission, type PermissionState,
} from '@/services/notifications';
import {NUDGE_TIMES} from '@/utils/notificationPrefs';
import {devSeedEarlyPraise} from '@/db/devSeed';// null outside __DEV__
import {colors, fonts, radii, spacing} from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// One settings row with a switch. The switch sits in a fixed, centred box, so the row lays out the same
// whatever size the native switch reports.
function SwitchRow({icon, label, value, onChange, disabled}: {
    icon: IconName;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <View style={styles.row}>
            <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
            <Text style={styles.rowText}>{label}</Text>
            <View style={styles.switchBox}>
                <Switch
                    value={value}
                    onValueChange={onChange}
                    disabled={disabled}
                    trackColor={{false: colors.border, true: colors.accent}}
                    thumbColor={colors.white}
                    ios_backgroundColor={colors.border}
                    accessibilityLabel={label}
                />
            </View>
        </View>
    );
}

// DEV ONLY: long-press the title to seed early-praise history (logs first, a second long press confirms)
const devSeed = devSeedEarlyPraise;
const onTitleLongPress = devSeed
    ? () => { devSeed(getFirebaseAuth().currentUser?.uid); }
    : undefined;

export default function SettingsScreen (){
    const {isAdmin, recheckIfFailed} = useIsAdmin();
    const celebrationsOn = useCelebrationsEnabled();
    const notificationPrefs = useNotificationPrefs();
    const [permission, setPermission] = useState<PermissionState | null>(null);
    const [asking, setAsking] = useState(false);
    const [available] = useState(notificationsAvailable);// fixed for the app run: the module loads once or never

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
                  value={available && notificationPrefs.remindersOn}
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

                {!available && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>Reminders aren&apos;t available in this version of the app on this phone yet.</Text>
                  </View>
                )}

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
                  onPress={signOut}
                  accessibilityRole="button">
                  <MaterialCommunityIcons name="logout" size={22} color={colors.error} />
                  <Text style={[styles.rowText, styles.signOutText]}>Sign Out</Text>
                </Pressable>
              </View>
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
  switchBox: {width: 52, height: 32, alignItems: 'center', justifyContent: 'center'},
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
  pressed: {opacity: 0.85},
});
