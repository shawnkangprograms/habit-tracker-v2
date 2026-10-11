import {router, type Href} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {getAdminOverview} from '@/services/admin';
import {getAuditEntries} from '@/services/adminAudit';
import {getFirebaseAuth} from '@/services/authInit';
import {useAdminData} from '@/services/useAdminData';
import {AdminStatus} from '@/components/admin-status';
import {AdminLogRow, type AuditEntry} from '@/components/admin-log-row';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type Stats = {
  total: number;
  age18to24: number;
  age25to34: number;
  age35plus: number;
  noAge: number;
  disabledUsers: number;
  catalogItems: number;
  auditEntries: number;
};

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

const RECENT_COUNT = 5;

// module level, so useAdminData gets a stable fetcher
async function fetchOverview() {
  const [stats, recent] = await Promise.all([getAdminOverview(), getAuditEntries(RECENT_COUNT)]);
  return {stats: stats as Stats, recent: recent as AuditEntry[]};
}

const QUICK_ACTIONS: {label: string; icon: GlyphName; href: Href}[] = [
  {label: 'Users', icon: 'account-group-outline', href: '/admin/users'},
  {label: 'Catalog', icon: 'format-list-checks', href: '/admin/catalog'},
  {label: 'Audit log', icon: 'history', href: '/admin/audit'},
];

function goBackToSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

export default function AdminOverviewScreen() {
  const {load, retry} = useAdminData(fetchOverview); // reloads on return after any admin write
  const myUid = getFirebaseAuth().currentUser?.uid;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>

        <Pressable style={styles.backRow} onPress={goBackToSettings} hitSlop={12} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>

        <Text style={styles.title}>Admin</Text>

        {load.status === 'loading' && <AdminStatus kind="loading" />}
        {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={retry} />}

        {load.status === 'ready' && (
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatCard label="TOTAL USERS" value={load.data.stats.total} />
              <StatCard label="DISABLED USERS" value={load.data.stats.disabledUsers} />
            </View>
            <View style={styles.gridRow}>
              <StatCard label="CATALOG ITEMS" value={load.data.stats.catalogItems} />
              <StatCard label="AUDIT ENTRIES" value={load.data.stats.auditEntries} />
            </View>
          </View>
        )}

        {/* navigation works without data, so the tiles show in every state */}
        <Text style={styles.label}>QUICK ACTIONS</Text>
        <View style={styles.gridRow}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              style={({pressed}) => [styles.card, styles.tile, pressed && styles.pressed]}
              onPress={() => router.push(action.href)}
              accessibilityRole="button">
              <MaterialCommunityIcons name={action.icon} size={24} color={colors.accent} />
              <Text style={styles.tileText} numberOfLines={1}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {load.status === 'ready' && (
          <>
            <Text style={styles.label}>AGE DISTRIBUTION</Text>
            <View style={[styles.card, styles.cardPadded]}>
              {load.data.stats.total === 0 ? (
                <Text style={styles.empty}>No users yet.</Text>
              ) : (
                <>
                  <AgeBar label="18-24" value={load.data.stats.age18to24} total={load.data.stats.total} />
                  <AgeBar label="25-34" value={load.data.stats.age25to34} total={load.data.stats.total} />
                  <AgeBar label="35+" value={load.data.stats.age35plus} total={load.data.stats.total} />
                  {load.data.stats.noAge > 0 && (
                    <AgeBar label="No age recorded" value={load.data.stats.noAge} total={load.data.stats.total} />
                  )}
                </>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.label}>RECENT ACTIVITY</Text>
              {load.data.recent.length > 0 && (
                <Pressable onPress={() => router.push('/admin/audit')} hitSlop={12} accessibilityRole="button">
                  <Text style={styles.link}>See all</Text>
                </Pressable>
              )}
            </View>
            <View style={[styles.card, load.data.recent.length === 0 && styles.cardPadded]}>
              {load.data.recent.length === 0 ? (
                <Text style={styles.empty}>No admin activity yet.</Text>
              ) : (
                load.data.recent.map((entry, i) => (
                  <AdminLogRow key={entry.id} entry={entry} myUid={myUid} last={i === load.data.recent.length - 1} />
                ))
              )}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({label, value}: {label: string; value: number}) {
  return (
    <View style={[styles.card, styles.stat]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// One horizontal bar: share of all users, labelled with the count and percentage
function AgeBar({label, value, total}: {label: string; value: number; total: number}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.bar} accessible accessibilityLabel={`${label}: ${value} users, ${percent} percent`}>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{value} <Text style={styles.barPercent}>· {percent}%</Text></Text>
      </View>
      <View style={styles.track}>
        {value > 0 && <View style={[styles.fill, {width: `${Math.max(percent, 1)}%`}]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted, marginTop: spacing.sm},
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'},
  link: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.accent},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  card: {
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  cardPadded: {paddingVertical: spacing.lg, gap: spacing.lg},
  grid: {gap: spacing.md},
  gridRow: {flexDirection: 'row', gap: spacing.md},
  stat: {flex: 1, paddingVertical: spacing.lg, gap: 2},
  statValue: {fontFamily: fonts.title, fontSize: 30, color: colors.text},
  statLabel: {fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8, color: colors.muted},
  tile: {flex: 1, alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm},
  tileText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.text},
  bar: {gap: 6},
  barLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  barLabel: {fontFamily: fonts.medium, fontSize: 13, color: colors.text},
  barValue: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.text},
  barPercent: {fontFamily: fonts.regular, color: colors.muted},
  track: {height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {height: 8, borderRadius: 4, backgroundColor: colors.accent},
  pressed: {opacity: 0.85},
});
