import {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {describeAdminError} from '@/services/admin';
import {
  createCatalogItem, deleteCatalogItem, describeCatalogWriteError, getCatalogItem, getCatalogItems, updateCatalogItem,
} from '@/services/adminCatalog';
import {AdminStatus} from '@/components/admin-status';
import {FrequencyPicker, IconGrid, NameField, ReminderField} from '@/components/habit-fields';
import {ICON_IDS, type Frequency, type IconId, type WeekdayKey} from '@/constants/habits';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {
  validateFrequency, validateHabitInput, validateHabitName, validateIcon, validateReminderTime,
} from '@/validation/validators';

const DUPLICATE_NAME = 'A starter habit with this name already exists.';

type CatalogItem = {id: string; name: string; icon: string; frequency: Frequency; reminderTime: string | null};
type FieldErrors = {name?: string; icon?: string; frequency?: string; reminder?: string};
type LoadState =
  | {status: 'loading'}
  | {status: 'error'; kind: 'offline' | 'denied' | 'error'; message: string}
  | {status: 'ready'};

const normalise = (name: string) => name.trim().toLowerCase(); // duplicate check: trimmed, case-insensitive

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/admin/catalog');
}

// Optional id param: absent = Add mode, present = Edit mode
export default function CatalogFormScreen() {
  const params = useLocalSearchParams<{id?: string}>();
  const itemId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const isEdit = !!itemId;

  // Add mode defaults match the habit form: star selected, Every day
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconId | null>('star');
  const [isWeekdays, setIsWeekdays] = useState(false);
  const [selectedDays, setSelectedDays] = useState<WeekdayKey[]>([]);
  const [reminder, setReminder] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [load, setLoad] = useState<LoadState>({status: 'loading'});
  const [attempt, setAttempt] = useState(0); // bumped by Retry to load again
  const [saving, setSaving] = useState(false); // drives the button's loading state
  const savingRef = useRef(false); // a ref, not state, so a second tap in the same frame is ignored
  const others = useRef<CatalogItem[]>([]); // the loaded catalog minus the item being edited, for the duplicate check
  const storedName = useRef(''); // the saved name, used in the delete log entry and confirm text

  // the whole catalog (for duplicates) and, in Edit mode, the item itself; both fresh from the server
  useEffect(() => {
    let active = true;
    Promise.all([getCatalogItems() as Promise<CatalogItem[]>, itemId ? getCatalogItem(itemId) as Promise<CatalogItem | null> : null])
      .then(([items, item]) => {
        if (!active) return;
        others.current = items.filter((i) => i.id !== itemId);
        if (itemId) {
          if (!item) {
            Alert.alert('Item not found', 'This starter habit no longer exists.', [{text: 'OK', onPress: goBack}]);
            return;
          }
          storedName.current = item.name;
          setName(item.name);
          // an icon id outside the allowed list leaves the grid unselected; Save then shows the icon error
          setIcon((ICON_IDS as readonly string[]).includes(item.icon) ? item.icon as IconId : null);
          if (item.frequency?.type === 'weekdays') {
            setIsWeekdays(true);
            setSelectedDays(Array.isArray(item.frequency.days) ? item.frequency.days : []);
          }
          setReminder(item.reminderTime ?? '');
        }
        setLoad({status: 'ready'});
      })
      .catch((err: unknown) => {
        if (active) setLoad({status: 'error', ...describeAdminError(err)});
      });
    return () => { active = false; };
  }, [itemId, attempt]);

  function retry() {
    setLoad({status: 'loading'});
    setAttempt((n) => n + 1);
  }

  const clearError = (field: keyof FieldErrors) => setErrors((e) => ({...e, [field]: undefined}));

  const toggleDay = (day: WeekdayKey) => {
    setSelectedDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
    clearError('frequency');
  };

  // a write that may still land later: say so, then leave the form so it isn't submitted twice
  function showWriteError(title: string, err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
    const message = describeCatalogWriteError(err);
    if (code === 'commit-unconfirmed' || code === 'not-found') Alert.alert(title, message, [{text: 'OK', onPress: goBack}]);
    else Alert.alert(title, message);
  }

  const handleSave = async () => {
    if (savingRef.current) return; // ignore extra taps while saving

    const reminderTime = reminder.trim() === '' ? null : reminder.trim(); // empty = no reminder
    const frequency: Frequency = isWeekdays ? {type: 'weekdays', days: selectedDays} : {type: 'daily'};

    // individual validators so every field can show its own message at once
    const nameResult = validateHabitName(name);
    const duplicate = nameResult.valid && others.current.some((i) => normalise(i.name) === normalise(nameResult.value));
    const iconResult = validateIcon(icon);
    const freq = validateFrequency(frequency);
    const time = validateReminderTime(reminderTime);
    setErrors({
      name: !nameResult.valid ? nameResult.error : duplicate ? DUPLICATE_NAME : undefined,
      icon: iconResult.valid ? undefined : iconResult.error,
      frequency: freq.valid ? undefined : freq.error,
      reminder: time.valid ? undefined : time.error,
    });

    const input = validateHabitInput({habitName: name, icon, frequency, reminderTime});
    if (!input.valid || duplicate) return;

    savingRef.current = true;
    setSaving(true);
    try {
      if (itemId) await updateCatalogItem(itemId, input.value);
      else await createCatalogItem(input.value);
      goBack();
    } catch (err) {
      showWriteError("Couldn't save starter habit", err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (savingRef.current || !itemId) return;
    Alert.alert('Delete starter habit?', `"${storedName.current}" will be removed from the catalog. This can't be undone.`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          try {
            await deleteCatalogItem(itemId, storedName.current);
            goBack();
          } catch (err) {
            showWriteError("Couldn't delete starter habit", err);
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* iOS: padding lifts the content above the keyboard. Android: the window resizes, so no behaviour is set */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <Pressable style={styles.backRow} onPress={goBack} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>Catalog</Text>
          </Pressable>

          <Text style={styles.title}>{isEdit ? 'Edit starter habit' : 'New starter habit'}</Text>

          {load.status === 'loading' && <View style={styles.statusGap}><AdminStatus kind="loading" /></View>}
          {load.status === 'error' && (
            <View style={styles.statusGap}><AdminStatus kind={load.kind} message={load.message} onRetry={retry} /></View>
          )}

          {load.status === 'ready' && (
            <>
              <NameField
                value={name}
                onChangeText={(text) => { setName(text); clearError('name'); }}
                error={errors.name}
              />
              <IconGrid value={icon} onChange={(id) => { setIcon(id); clearError('icon'); }} error={errors.icon} />
              <FrequencyPicker
                isWeekdays={isWeekdays}
                onChangeWeekdays={(weekdays) => { setIsWeekdays(weekdays); clearError('frequency'); }}
                days={selectedDays}
                onToggleDay={toggleDay}
                error={errors.frequency}
              />
              <ReminderField
                value={reminder}
                onChangeText={(text) => { setReminder(text); clearError('reminder'); }}
                error={errors.reminder}
              />
            </>
          )}
        </ScrollView>

        {/* pinned actions, outside the scroll view */}
        {load.status === 'ready' && (
          <View style={styles.footer}>
            <Pressable
              style={({pressed}) => [styles.primaryButton, (pressed || saving) && styles.pressed]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button">
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryText}>{isEdit ? 'Save changes' : 'Save starter habit'}</Text>}
            </Pressable>
            {isEdit && (
              <Pressable
                style={({pressed}) => [styles.deleteButton, (pressed || saving) && styles.pressed]}
                onPress={handleDelete}
                disabled={saving}
                accessibilityRole="button">
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
                <Text style={styles.deleteText}>Delete starter habit</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.lg},
  statusGap: {marginTop: spacing.xl},
  footer: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
  deleteButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.error + '14', // ~8% opacity
    borderWidth: 1,
    borderColor: colors.error + '73', // ~45% opacity
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  deleteText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.error},
  pressed: {opacity: 0.85},
});
