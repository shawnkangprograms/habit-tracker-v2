import {useEffect, useState} from 'react';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {USERS_LIMIT, describeAdminError, getAdminUsers} from '@/services/admin';
import {getFirebaseAuth} from '@/services/authInit';
import {AdminStatus} from '@/components/admin-status';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type AdminUser = {uid: string; age: number | null};

type LoadState =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'ready'; users: AdminUser[]};

function goBackToOverview() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/overview');
}

export default function AdminUsersScreen() {
  const [load, setLoad] = useState<LoadState>({status: 'loading'});
  const [attempt, setAttempt] = useState(0); // bumped by Retry to run the fetch again
  const myUid = getFirebaseAuth().currentUser?.uid; // to tag the admin's own row

  useEffect(() => {
    let active = true; // ignore a result that arrives after leaving the screen or a newer attempt
    getAdminUsers().then(
      (users: AdminUser[]) => { if (active) setLoad({status: 'ready', users}); },
      (err: unknown) => { if (active) setLoad({status: 'error', ...describeAdminError(err)}); },
    );
    return () => { active = false; };
  }, [attempt]);

  function retry() {
    setLoad({status: 'loading'});
    setAttempt((n) => n + 1);
  }

  const header = (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={goBackToOverview} hitSlop={12} accessibilityRole="button">
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        <Text style={styles.backText}>Admin</Text>
      </Pressable>

      <Text style={styles.title}>Users</Text>

      {load.status === 'loading' && <AdminStatus kind="loading" />}
      {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={retry} />}

      {load.status === 'ready' && (
        <Text style={styles.note}>
          {load.users.length >= USERS_LIMIT ? `Showing first ${USERS_LIMIT}` : `Showing all ${load.users.length}`}
        </Text>
      )}
      {load.status === 'ready' && load.users.length > 0 && (
        <View style={styles.columns}>
          <Text style={styles.label}>USER</Text>
          <Text style={styles.label}>AGE</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <FlatList
        data={load.status === 'ready' ? load.users : []}
        keyExtractor={(user) => user.uid}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({item}) => (
          <View style={styles.row}>
            <Text style={styles.uid}>
              {item.uid.slice(0, 8)}
              {item.uid === myUid && <Text style={styles.you}>  (you)</Text>}
            </Text>
            <Text style={styles.age}>{item.age ?? '—'}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 7},
  header: {gap: spacing.md},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm},
  note: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  columns: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uid: {fontFamily: fonts.medium, fontSize: 14, color: colors.text},
  you: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  age: {fontFamily: fonts.title, fontSize: 16, color: colors.accent},
});
