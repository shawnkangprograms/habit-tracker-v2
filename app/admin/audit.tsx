import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {getAuditEntries} from '@/services/adminAudit';
import {getFirebaseAuth} from '@/services/authInit';
import {useAdminData} from '@/services/useAdminData';
import {AdminStatus} from '@/components/admin-status';
import {AdminLogRow, type AuditEntry} from '@/components/admin-log-row';
import {colors, fonts, radii, spacing} from '@/constants/theme';

const AUDIT_LIMIT = 50;

// module level, so useAdminData gets a stable fetcher
const fetchAudit = () => getAuditEntries(AUDIT_LIMIT) as Promise<AuditEntry[]>;

function goBackToOverview() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/overview');
}

export default function AdminAuditScreen() {
  const {load, retry} = useAdminData(fetchAudit);
  const myUid = getFirebaseAuth().currentUser?.uid;
  const entries = load.status === 'ready' ? load.data : [];

  const header = (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={goBackToOverview} hitSlop={12} accessibilityRole="button">
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        <Text style={styles.backText}>Admin</Text>
      </Pressable>

      <Text style={styles.title}>Audit log</Text>
      <Text style={styles.note}>Last {AUDIT_LIMIT} admin changes, newest first.</Text>

      {load.status === 'loading' && <AdminStatus kind="loading" />}
      {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={retry} />}
      {load.status === 'ready' && entries.length === 0 && <Text style={styles.note}>No admin activity yet.</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({item, index}) => (
          <View style={[
            styles.cardSlice,
            index === 0 && styles.cardTop,
            index === entries.length - 1 && styles.cardBottom,
          ]}>
            <AdminLogRow entry={item} myUid={myUid} last={index === entries.length - 1} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  header: {gap: spacing.md, marginBottom: spacing.md},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm},
  note: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  // each row is a slice of one card, so the list keeps FlatList's virtualisation
  cardSlice: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  cardTop: {borderTopWidth: 1, borderTopLeftRadius: radii.habitCard, borderTopRightRadius: radii.habitCard},
  cardBottom: {borderBottomWidth: 1, borderBottomLeftRadius: radii.habitCard, borderBottomRightRadius: radii.habitCard},
});
