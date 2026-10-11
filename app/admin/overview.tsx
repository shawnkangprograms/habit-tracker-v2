import {useEffect, useState} from 'react';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {describeAdminError, getAdminOverview} from '@/services/admin';
import {AdminStatus} from '@/components/admin-status';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type Overview = {
  total: number;
  age18to24: number;
  age25to34: number;
  age35plus: number;
  noAge: number;
  catalogItems: number;
};

type LoadState =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'ready'; data: Overview};

function goBackToSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

export default function AdminOverviewScreen() {
  const [load, setLoad] = useState<LoadState>({status: 'loading'});
  const [attempt, setAttempt] = useState(0); // bumped by Retry to run the fetch again

  useEffect(() => {
    let active = true; // ignore a result that arrives after leaving the screen or a newer attempt
    getAdminOverview().then(
      (data: Overview) => { if (active) setLoad({status: 'ready', data}); },
      (err: unknown) => { if (active) setLoad({status: 'error', ...describeAdminError(err)}); },
    );
    return () => { active = false; };
  }, [attempt]);

  function retry() {
    setLoad({status: 'loading'});
    setAttempt((n) => n + 1);
  }

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
          <>
            <View style={styles.statRow}>
              <StatCard label="TOTAL USERS" value={load.data.total} />
              <StatCard label="CATALOG ITEMS" value={load.data.catalogItems} />
            </View>

            <Text style={styles.label}>AGE BREAKDOWN</Text>
            <View style={styles.card}>
              <AgeRow label="18-24" value={load.data.age18to24} />
              <AgeRow label="25-34" value={load.data.age25to34} />
              <AgeRow label="35+" value={load.data.age35plus} />
              {load.data.noAge > 0 && <AgeRow label="No age recorded" value={load.data.noAge} />}
            </View>
          </>
        )}

        <Pressable
          style={({pressed}) => [styles.card, styles.linkRow, pressed && styles.pressed]}
          onPress={() => router.push('/admin/users')}
          accessibilityRole="button">
          <MaterialCommunityIcons name="account-group-outline" size={22} color={colors.accent} />
          <Text style={styles.linkText}>Users</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

        {/* temporary entry point; Phase 2 replaces these rows with quick-action tiles */}
        <Pressable
          style={({pressed}) => [styles.card, styles.linkRow, pressed && styles.pressed]}
          onPress={() => router.push('/admin/catalog')}
          accessibilityRole="button">
          <MaterialCommunityIcons name="format-list-checks" size={22} color={colors.accent} />
          <Text style={styles.linkText}>Catalog</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({label, value}: {label: string; value: number}) {
  return (
    <View style={[styles.card, styles.stat]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function AgeRow({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.ageRow}>
      <Text style={styles.ageLabel}>{label}</Text>
      <Text style={styles.ageValue}>{value}</Text>
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
  card: {
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  statRow: {flexDirection: 'row', gap: spacing.md},
  stat: {flex: 1, paddingVertical: spacing.lg},
  statValue: {fontFamily: fonts.title, fontSize: 30, color: colors.text},
  ageRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md},
  ageLabel: {fontFamily: fonts.medium, fontSize: 14, color: colors.text},
  ageValue: {fontFamily: fonts.title, fontSize: 16, color: colors.accent},
  linkRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, marginTop: spacing.sm},
  linkText: {flex: 1, fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  pressed: {opacity: 0.85},
});
