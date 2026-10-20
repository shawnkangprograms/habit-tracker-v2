import {useState} from 'react';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {USERS_LIMIT, getAdminUsers} from '@/services/admin';
import {getFirebaseAuth} from '@/services/authInit';
import {useAdminData} from '@/services/useAdminData';
import {AdminStatus} from '@/components/admin-status';
import {colors, fonts, radii, spacing} from '@/constants/theme';

type AdminUser = {uid: string; age: number | null; disabled: boolean};
type Filter = 'all' | 'disabled' | '18-24' | '25-34' | '35+';

const FILTERS: {key: Filter; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'disabled', label: 'Disabled'},
  {key: '18-24', label: '18-24'},
  {key: '25-34', label: '25-34'},
  {key: '35+', label: '35+'},
];

// same buckets as the Overview counts
function matchesFilter(user: AdminUser, filter: Filter): boolean {
  switch (filter) {
    case 'disabled': return user.disabled;
    case '18-24': return user.age !== null && user.age >= 18 && user.age < 25;
    case '25-34': return user.age !== null && user.age >= 25 && user.age < 35;
    case '35+': return user.age !== null && user.age >= 35;
    default: return true;
  }
}

// module level, so useAdminData gets a stable fetcher
const fetchUsers = () => getAdminUsers() as Promise<AdminUser[]>;

function goBackToOverview() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/overview');
}

export default function AdminUsersScreen() {
  const {load, retry} = useAdminData(fetchUsers); // reloads on return after a Disable/Enable
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const myUid = getFirebaseAuth().currentUser?.uid; // to tag the admin's own row

  const all = load.status === 'ready' ? load.data : [];
  const prefix = search.trim().toLowerCase();
  const shown = all.filter((u) => u.uid.toLowerCase().startsWith(prefix) && matchesFilter(u, filter));
  const capped = all.length >= USERS_LIMIT;

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
        <>
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by user ID"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear search">
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <View style={styles.chips}>
            {FILTERS.map(({key, label}) => {
              const selected = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                  accessibilityRole="button"
                  accessibilityState={{selected}}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.note}>
            {capped
              ? `Showing ${shown.length} of the first ${USERS_LIMIT} users. Search and filters cover these only.`
              : `Showing ${shown.length} of ${all.length} users.`}
          </Text>
          {shown.length === 0 && <Text style={styles.empty}>No users match.</Text>}
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <FlatList
        data={shown}
        keyExtractor={(user) => user.uid}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({item}) => (
          <Pressable
            style={({pressed}) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push({pathname: '/admin/user', params: {uid: item.uid}})}
            accessibilityRole="button">
            <View style={styles.rowMain}>
              <Text style={styles.uid}>
                {item.uid.slice(0, 8)}
                {item.uid === myUid && <Text style={styles.you}>  (you)</Text>}
              </Text>
              {item.disabled && (
                <View style={styles.badge}>
                  <MaterialCommunityIcons name="account-cancel-outline" size={12} color={colors.error} />
                  <Text style={styles.badgeText}>Disabled</Text>
                </View>
              )}
            </View>
            <Text style={styles.age}>{item.age ?? '—'}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        )}
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
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 14, color: colors.text},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {height: 34, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipSelected: {backgroundColor: colors.accent},
  chipUnselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  chipText: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.muted},
  chipTextSelected: {color: colors.white},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap'},
  uid: {fontFamily: fonts.medium, fontSize: 14, color: colors.text},
  you: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: `${colors.error}1f`,
  },
  badgeText: {fontFamily: fonts.semiBold, fontSize: 10, color: colors.error},
  age: {fontFamily: fonts.title, fontSize: 16, color: colors.text},
  pressed: {opacity: 0.85},
});
