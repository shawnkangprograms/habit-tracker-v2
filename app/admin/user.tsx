import {useEffect, useRef, useState} from 'react';
import {router, useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {describeAdminError, describeUserWriteError, getAdminUser, setUserDisabled} from '@/services/admin';
import {getFirebaseAuth} from '@/services/authInit';
import {AdminStatus} from '@/components/admin-status';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type AdminUser = {uid: string; age: number | null; disabled: boolean};

type LoadState =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'missing'}
  | {status: 'ready'; user: AdminUser};

function goBackToUsers() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/users');
}

export default function AdminUserScreen() {
  const params = useLocalSearchParams<{uid?: string}>();
  const uid = typeof params.uid === 'string' ? params.uid : '';
  const isMe = uid === getFirebaseAuth().currentUser?.uid; // no Disable/Enable on your own account

  const [load, setLoad] = useState<LoadState>({status: 'loading'});
  const [attempt, setAttempt] = useState(0); // bumped by Retry, and after a write, to read the user again
  const [saving, setSaving] = useState(false); // drives the button's loading state
  const savingRef = useRef(false); // a ref, not state, so a second tap in the same frame is ignored

  useEffect(() => {
    let active = true; // ignore a result that arrives after leaving the screen or a newer attempt
    const read = uid ? getAdminUser(uid) as Promise<AdminUser | null> : Promise.resolve(null);
    read.then(
      (user) => { if (active) setLoad(user ? {status: 'ready', user} : {status: 'missing'}); },
      (err: unknown) => { if (active) setLoad({status: 'error', ...describeAdminError(err)}); },
    );
    return () => { active = false; };
  }, [uid, attempt]);

  function reload() {
    setLoad({status: 'loading'});
    setAttempt((n) => n + 1);
  }

  function confirmToggle(user: AdminUser) {
    if (savingRef.current) return;
    const disabling = !user.disabled;
    Alert.alert(
      disabling ? 'Disable this user?' : 'Enable this user?',
      disabling
        ? "They'll be signed out the next time they open or return to the app. Their data is kept."
        : "They'll be able to sign in again.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: disabling ? 'Disable' : 'Enable',
          style: disabling ? 'destructive' : 'default',
          onPress: () => toggle(user.uid, disabling),
        },
      ],
    );
  }

  async function toggle(targetUid: string, disabled: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setUserDisabled(targetUid, disabled);
      setLoad((prev) => prev.status === 'ready' ? {status: 'ready', user: {...prev.user, disabled}} : prev);
    } catch (err) {
      Alert.alert(disabled ? "Couldn't disable user" : "Couldn't enable user", describeUserWriteError(err));
      reload(); // show the user's real status after a failed or unconfirmed write
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>

        <Pressable style={styles.backRow} onPress={goBackToUsers} hitSlop={12} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
          <Text style={styles.backText}>Users</Text>
        </Pressable>

        <Text style={styles.title}>User {uid.slice(0, 8)}</Text>

        {load.status === 'loading' && <AdminStatus kind="loading" />}
        {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={reload} />}
        {load.status === 'missing' && <Text style={styles.note}>This user no longer exists.</Text>}

        {load.status === 'ready' && (
          <>
            <View style={styles.card}>
              <View style={[styles.field, styles.divider]}>
                <Text style={styles.label}>USER ID</Text>
                <Text style={styles.value} selectable>{load.user.uid}</Text>
              </View>
              <View style={[styles.field, styles.divider]}>
                <Text style={styles.label}>AGE</Text>
                <Text style={styles.value}>{load.user.age ?? 'Not recorded'}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>STATUS</Text>
                {/* status always has an icon and a word, never colour alone */}
                <View style={styles.status}>
                  <MaterialCommunityIcons
                    name={load.user.disabled ? 'account-cancel-outline' : 'account-check-outline'}
                    size={18}
                    color={load.user.disabled ? colors.error : colors.green}
                  />
                  <Text style={styles.value}>{load.user.disabled ? 'Disabled' : 'Active'}</Text>
                </View>
              </View>
            </View>

            {isMe ? (
              <Text style={styles.note}>This is your account. You can&apos;t change your own status.</Text>
            ) : (
              <Pressable
                style={({pressed}) => [
                  load.user.disabled ? styles.primaryButton : styles.dangerButton,
                  (pressed || saving) && styles.pressed,
                ]}
                onPress={() => load.status === 'ready' && confirmToggle(load.user)}
                disabled={saving}
                accessibilityRole="button">
                {saving ? (
                  <ActivityIndicator color={load.user.disabled ? colors.white : colors.error} />
                ) : load.user.disabled ? (
                  <Text style={styles.primaryText}>Enable user</Text>
                ) : (
                  <>
                    <MaterialCommunityIcons name="account-cancel-outline" size={18} color={colors.error} />
                    <Text style={styles.dangerText}>Disable user</Text>
                  </>
                )}
              </Pressable>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm},
  note: {fontFamily: fonts.regular, fontSize: 13, color: colors.muted},
  card: {
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  field: {paddingVertical: spacing.md, gap: 4},
  divider: {borderBottomWidth: 1, borderBottomColor: colors.border},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  value: {fontFamily: fonts.medium, fontSize: 15, color: colors.text},
  status: {flexDirection: 'row', alignItems: 'center', gap: 6},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  dangerButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.error + '14', // ~8% opacity, as the habit form's delete button
    borderWidth: 1,
    borderColor: colors.error + '73', // ~45% opacity
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dangerText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.error},
  pressed: {opacity: 0.85},
});
