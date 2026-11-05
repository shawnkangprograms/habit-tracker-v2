import {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Crypto from 'expo-crypto';

import {getActiveHabitsWithDays} from '@/db/habits';
import {packsStore} from '@/services/packsStore';
import {checkAddFor} from '@/services/packLimits';
import {useSessionUid} from '@/services/session';
import type {IconId} from '@/constants/habits';
import {HabitIcon} from '@/constants/habitIcons';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import type {ActiveHabit} from '@/utils/homeSections';
import {
  AREA_LABEL, AREA_LOCKED_NOTE, CANCEL, CREATE_PACK_SAVE, DELETE_PACK, DELETE_PACK_BODY, DELETE_PACK_FAILED,
  DELETE_PACK_TITLE, EDIT_PACK_TITLE, HABITS_LABEL, NEW_PACK_TITLE, NO_HABITS_TO_ADD, PACK_NAME_LABEL,
  PACK_NAME_PLACEHOLDER, PACK_NOT_FOUND_BODY, PACK_NOT_FOUND_TITLE, SAVE_CHANGES, SAVE_PACK_FAILED, SETTINGS_PACKS_ROW,
  TRY_AGAIN, inPack,
} from '@/utils/packs/copy';
import {
  AREA_ORDER, baseRecord, deletePack, normalisePackName, packArea, packNameError, packOf, savePack,
} from '@/utils/packs/manage';
import {PACK_NAME_MAX, type PacksRecord} from '@/utils/packs/record';
import type {Axis} from '@/utils/onboarding/types';

// Create or edit a habit pack (docs/PACKS_REPORTS_SPEC.md, section 4, Stage 2). Create: from Home's "Create a
// habit pack" and the picker's "Create your own pack". Edit (?packId=): from a pack card's pencil. Name, area
// (chosen once, then read-only), and every active habit as a checklist; ticking a habit that is in another pack
// moves it here. Delete keeps the habits. Everything is saved on this phone only, in one store write.

function clockNow(): number {
  return Date.now();
}

function goBack(from: string | undefined) {
  if (router.canGoBack()) router.back();
  else router.replace(from === 'packs' ? '/packs/choose' : '/');
}

function notFound(from: string | undefined) {
  Alert.alert(PACK_NOT_FOUND_TITLE, PACK_NOT_FOUND_BODY, [{text: 'OK', onPress: () => goBack(from)}]);
}

type Loaded = {record: PacksRecord; habits: ActiveHabit[]};

export default function EditPackScreen() {
  const params = useLocalSearchParams<{packId?: string; from?: string}>();
  const packId = typeof params.packId === 'string' && params.packId ? params.packId : null;
  const from = params.from;
  const uid = useSessionUid();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);// the name error shows once the user has typed or left the field
  const [area, setArea] = useState<Axis | null>(null);
  const [areaLocked, setAreaLocked] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    Promise.all([packsStore.read(uid), getActiveHabitsWithDays(uid) as Promise<ActiveHabit[]>])
      .then(([parsed, habits]) => {
        if (!active) return;
        const record = baseRecord(parsed);
        if (packId !== null) {
          const pack = record.packs.find((p) => p.id === packId);
          if (!pack) {
            notFound(from);
            return;
          }
          setName(pack.name);
          setArea(packArea(pack));
          setAreaLocked(packArea(pack) !== null);
          const live = new Set(habits.map((h) => h.habitId));
          setTicked(pack.habitIds.filter((id) => live.has(id)));
        }
        setLoaded({record, habits});
      })
      .catch(() => {
        if (active) Alert.alert(SAVE_PACK_FAILED, TRY_AGAIN, [{text: 'OK', onPress: () => goBack(from)}]);
      });
    return () => {
      active = false;
    };
  }, [uid, packId, from]);

  const nameError = loaded ? packNameError(name, loaded.record, packId ?? undefined) : null;
  const canSave = loaded !== null && nameError === null && (packId !== null || area !== null) && !saving;

  const toggle = (habitId: string) => {
    setTicked((ids) => (ids.includes(habitId) ? ids.filter((id) => id !== habitId) : [...ids, habitId]));
  };

  const save = async () => {
    if (!uid || !loaded || !canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (packId === null) {
        const check = await checkAddFor(uid, 'packs');
        if (!check.ok) {
          setLimitMessage(check.message);
          return;
        }
      }
      let missing = false;
      await packsStore.update(uid, (parsed) => {
        const next = savePack(baseRecord(parsed), {
          packId, newId: Crypto.randomUUID(), name, area, habitIds: ticked, habits: loaded.habits, now: clockNow(),
        });
        missing = next === null && packId !== null && !baseRecord(parsed).packs.some((p) => p.id === packId);
        return next;
      });
      if (missing) notFound(from);
      else goBack(from);
    } catch {
      Alert.alert(SAVE_PACK_FAILED, TRY_AGAIN);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remove = () => {
    if (!uid || packId === null) return;
    Alert.alert(DELETE_PACK_TITLE, DELETE_PACK_BODY, [
      {text: CANCEL, style: 'cancel'},
      {
        text: DELETE_PACK,
        style: 'destructive',
        onPress: async () => {
          try {
            // the last pack gone also saves "Not now", so the choose card doesn't come straight back
            await packsStore.update(uid, (parsed) => (parsed.kind === 'ok' ? deletePack(parsed.record, packId) : null), {dismissIfEmpty: true});
            goBack(from);
          } catch {
            Alert.alert(DELETE_PACK_FAILED, TRY_AGAIN);
          }
        },
      },
    ]);
  };

  const nameLength = Array.from(normalisePackName(name)).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backRow} onPress={() => goBack(from)} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
            <Text style={styles.backText}>{from === 'packs' ? SETTINGS_PACKS_ROW : 'Home'}</Text>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">{packId === null ? NEW_PACK_TITLE : EDIT_PACK_TITLE}</Text>

          {!loaded ? (
            <ActivityIndicator style={styles.loading} color={colors.accent} />
          ) : (
            <>
              {/* PACK NAME */}
              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{PACK_NAME_LABEL}</Text>
                  <Text style={[styles.label, nameLength > PACK_NAME_MAX && styles.errorColor]}>{nameLength}/{PACK_NAME_MAX}</Text>
                </View>
                <TextInput
                  style={[styles.input, touched && nameError && styles.inputError]}
                  value={name}
                  onChangeText={(text) => { setName(text); setTouched(true); }}
                  onBlur={() => setTouched(true)}
                  placeholder={PACK_NAME_PLACEHOLDER}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.accent}
                  returnKeyType="done"
                  accessibilityLabel={PACK_NAME_LABEL}
                />
                {touched && nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
              </View>

              {/* AREA: chosen once, then read-only */}
              <View style={styles.section}>
                <Text style={[styles.label, styles.labelGap]}>{AREA_LABEL}</Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={AREA_LABEL}>
                  {AREA_ORDER.map((option) => {
                    const selected = area === option;
                    if (areaLocked && !selected) return null;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setArea(option)}
                        disabled={areaLocked}
                        style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                        hitSlop={4}
                        accessibilityRole="radio"
                        accessibilityState={{selected, disabled: areaLocked}}>
                        <Text style={[styles.chipText, selected && styles.whiteText]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!areaLocked && <Text style={styles.helperText}>{AREA_LOCKED_NOTE}</Text>}
              </View>

              {/* HABITS */}
              <View style={styles.section}>
                <Text style={[styles.label, styles.labelGap]}>{HABITS_LABEL}</Text>
                {loaded.habits.length === 0 ? (
                  <Text style={styles.helperText}>{NO_HABITS_TO_ADD}</Text>
                ) : (
                  <View style={styles.list}>
                    {loaded.habits.map((habit) => {
                      const checked = ticked.includes(habit.habitId);
                      const owner = packOf(loaded.record, habit.habitId);
                      const elsewhere = owner && owner.id !== packId ? inPack(owner.name) : null;
                      const icon = habit.icon as IconId;
                      const color = ICON_COLORS[icon] ?? colors.accent;
                      return (
                        <Pressable
                          key={habit.habitId}
                          style={({pressed}) => [styles.habit, checked && styles.habitChecked, pressed && styles.pressed]}
                          onPress={() => toggle(habit.habitId)}
                          accessibilityRole="checkbox"
                          accessibilityState={{checked}}
                          accessibilityLabel={elsewhere ? `${habit.habitName}, ${elsewhere}` : habit.habitName}>
                          <View style={[styles.badge, {backgroundColor: `${color}30`}]}>
                            <HabitIcon id={icon} size={18} color={color} />
                          </View>
                          <View style={styles.habitText}>
                            <Text style={styles.habitName} numberOfLines={1}>{habit.habitName}</Text>
                            {elsewhere && <Text style={styles.habitPack} numberOfLines={1}>{elsewhere}</Text>}
                          </View>
                          <MaterialCommunityIcons
                            name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                            size={24}
                            color={checked ? colors.accent : colors.muted}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* pinned actions, outside the scroll view */}
        <View style={styles.footer}>
          {limitMessage && <Text style={styles.limit} accessibilityLiveRegion="polite">{limitMessage}</Text>}
          <Pressable
            style={({pressed}) => [styles.primaryButton, (!canSave || pressed) && styles.saveOff]}
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{disabled: !canSave, busy: saving}}>
            {saving
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.primaryText}>{packId === null ? CREATE_PACK_SAVE : SAVE_CHANGES}</Text>}
          </Pressable>
          {packId !== null && loaded && (
            <Pressable
              style={({pressed}) => [styles.deleteButton, pressed && styles.pressed]}
              onPress={remove}
              accessibilityRole="button">
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              <Text style={styles.deleteText}>{DELETE_PACK}</Text>
            </Pressable>
          )}
        </View>
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
  loading: {marginTop: spacing.xxl},
  section: {marginTop: spacing.xl},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm},
  label: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted},
  labelGap: {marginBottom: spacing.sm},
  input: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {borderColor: colors.error},
  errorText: {fontFamily: fonts.medium, fontSize: 12, color: colors.error, marginTop: spacing.sm},
  errorColor: {color: colors.error},
  helperText: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: spacing.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {height: 40, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  chipSelected: {backgroundColor: colors.accent},
  chipUnselected: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  chipText: {fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted},
  whiteText: {color: colors.white},
  list: {gap: spacing.sm},
  habit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  habitChecked: {borderColor: colors.accent},
  badge: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center'},
  habitText: {flex: 1, gap: 1},
  habitName: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
  habitPack: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  pressed: {opacity: 0.85},
  footer: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  limit: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, textAlign: 'center'},
  primaryButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: {opacity: 0.5},
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
});
