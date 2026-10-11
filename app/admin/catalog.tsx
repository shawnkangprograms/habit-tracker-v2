import {useCallback, useEffect, useRef, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {describeAdminError, getAdminDataVersion} from '@/services/admin';
import {CATALOG_LIMIT, getCatalogItems} from '@/services/adminCatalog';
import {AdminStatus} from '@/components/admin-status';
import {HabitIcon} from '@/constants/habitIcons';
import {ICON_IDS, type Frequency, type IconId} from '@/constants/habits';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {scheduleText} from '@/utils/schedule';

type CatalogItem = {id: string; name: string; icon: string; frequency: Frequency; reminderTime: string | null};

type LoadState =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'ready'; items: CatalogItem[]};

function goBackToOverview() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/overview');
}

const isIconId = (icon: string): icon is IconId => (ICON_IDS as readonly string[]).includes(icon);

export default function AdminCatalogScreen() {
  const [load, setLoad] = useState<LoadState>({status: 'loading'});
  const loadedVersion = useRef(-1); // adminDataVersion at the last successful load; -1 = never loaded
  const loading = useRef(false); // skip a focus reload while one is already running
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchItems = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    const version = getAdminDataVersion();
    getCatalogItems()
      .then((items: CatalogItem[]) => {
        loadedVersion.current = version;
        if (mounted.current) setLoad({status: 'ready', items});
      })
      .catch((err: unknown) => {
        if (mounted.current) setLoad({status: 'error', ...describeAdminError(err)});
      })
      .finally(() => { loading.current = false; });
  }, []);

  // on first focus, and again after returning from a save or delete (the version changed)
  useFocusEffect(useCallback(() => {
    if (loadedVersion.current !== getAdminDataVersion()) fetchItems();
  }, [fetchItems]));

  function retry() {
    setLoad({status: 'loading'});
    fetchItems();
  }

  const header = (
    <View style={styles.header}>
      <Pressable style={styles.backRow} onPress={goBackToOverview} hitSlop={12} accessibilityRole="button">
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        <Text style={styles.backText}>Admin</Text>
      </Pressable>

      <Text style={styles.title}>Catalog</Text>
      <Text style={styles.note}>Starter habits suggested to users.</Text>

      {load.status === 'loading' && <AdminStatus kind="loading" />}
      {load.status === 'error' && <AdminStatus kind={load.kind} message={load.message} onRetry={retry} />}

      {load.status === 'ready' && (
        <>
          <Pressable
            style={({pressed}) => [styles.addRow, pressed && styles.pressed]}
            onPress={() => router.push('/admin/catalog-form')}
            accessibilityRole="button">
            <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />
            <Text style={styles.addText}>Add a starter habit</Text>
          </Pressable>
          {load.items.length === 0 && <Text style={styles.note}>No starter habits yet.</Text>}
          {load.items.length >= CATALOG_LIMIT && <Text style={styles.note}>Showing first {CATALOG_LIMIT}</Text>}
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <FlatList
        data={load.status === 'ready' ? load.items : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({item}) => {
          const icon = isIconId(item.icon) ? item.icon : 'star'; // unknown icon id: show a fallback, the form flags it
          const color = ICON_COLORS[icon];
          return (
            <Pressable
              style={({pressed}) => [styles.card, {backgroundColor: `${color}14`, borderColor: `${color}54`}, pressed && styles.pressed]}
              onPress={() => router.push({pathname: '/admin/catalog-form', params: {id: item.id}})}
              accessibilityRole="button">
              <View style={[styles.badge, {backgroundColor: `${color}30`, borderColor: `${color}80`}]}>
                <HabitIcon id={icon} size={21} color={color} />
              </View>
              <View style={styles.details}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{scheduleText(item.frequency, item.reminderTime)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 7},
  header: {gap: spacing.md, marginBottom: 3},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.sm},
  note: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 59,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  addText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.accent},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 59,
    paddingHorizontal: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: radii.iconBadge,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {flex: 1, gap: 2},
  name: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  subtitle: {fontFamily: fonts.regular, fontSize: 10, color: colors.muted},
  pressed: {opacity: 0.85},
});
