import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useLocalSearchParams} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {getActiveHabitsWithDays} from '@/db/habits';
import {getGamificationStats} from '@/db/gamification';
import {usePacks} from '@/hooks/use-packs';
import {packsStore} from '@/services/packsStore';
import {useSessionUid} from '@/services/session';
import {loadShared} from '@/services/statsStore';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {getLocalDateString} from '@/utils/dates';
import type {GamificationStats} from '@/utils/gamification';
import {BUILTIN_PACKS, type BuiltinPackId} from '@/utils/packs/builtin';
import {CHOOSE_ADOPT_NOTE, PACK_NAMES, SAVE_PACKS, chooseTitle, habitCount, packLimitMessage} from '@/utils/packs/copy';
import {limitsForLevel, nextLimitLevel} from '@/utils/packs/limits';
import type {HabitRef} from '@/utils/packs/membership';
import {ownedBuiltins, packsAfterPick, togglePick} from '@/utils/packs/picker';
import {TEMPLATE_NAMES} from '@/utils/onboarding/copy';

// "Choose your habit packs" (docs/PACKS_REPORTS_SPEC.md, section 3): the six built-in packs with their habits;
// pick up to the pack limit for the user's level. Opened from Home's choose card and from Settings > Habit packs.
// Packs the user already has show as picked and stay (removing one is stage 2). Saving is local only.

function clockNow(): number {
  return Date.now();
}

function goBack(from: string | undefined) {
  if (router.canGoBack()) router.back();
  else router.replace(from === 'settings' ? '/settings' : '/');
}

export default function ChoosePacksScreen() {
  const {from} = useLocalSearchParams<{from?: string}>();
  const uid = useSessionUid();
  const packs = usePacks(uid);
  const [level, setLevel] = useState<number | null>(null);
  const [picked, setPicked] = useState<BuiltinPackId[]>([]);
  const [limitLevel, setLimitLevel] = useState<number | null>(null);// the {x} of the pack limit message, while shown
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // The level from local SQLite (the stats Home already shares, or one local computation); never the network.
  // If that fails, level 1, the lowest limit.
  useEffect(() => {
    if (!uid) return;
    let active = true;
    loadShared(uid, getLocalDateString(), () => getGamificationStats(uid) as Promise<GamificationStats>)
      .then((result) => {
        if (active) setLevel(result.entry?.stats.level ?? 1);
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const parsed = packs?.parsed ?? null;
  const owned = parsed ? ownedBuiltins(parsed) : [];
  const packCount = parsed?.kind === 'ok' ? parsed.record.packs.length : 0;
  const ready = parsed !== null && level !== null;
  const canSave = ready && picked.length > 0 && !saving;

  const tap = (id: BuiltinPackId) => {
    if (parsed === null || level === null) return;
    const result = togglePick({picked, id, owned, packCount, level});
    setPicked(result.picked);
    setLimitLevel(result.limited ? nextLimitLevel(level, 'packs') : null);
  };

  const save = async () => {
    if (!uid || !canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // the active habits, for adoption; if that read fails nothing is adopted and the packs are still saved
      const habits = await (getActiveHabitsWithDays(uid) as Promise<HabitRef[]>).catch(() => [] as HabitRef[]);
      await packsStore.update(uid, (current) => packsAfterPick(current, picked, habits, clockNow()));// never throws
      goBack(from);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backRow} onPress={() => goBack(from)} hitSlop={12} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
          <Text style={styles.backText}>{from === 'settings' ? 'Settings' : 'Home'}</Text>
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">{chooseTitle(limitsForLevel(level ?? 1).packs)}</Text>
        <Text style={styles.note}>{CHOOSE_ADOPT_NOTE}</Text>

        {!ready ? (
          <ActivityIndicator style={styles.loading} color={colors.accent} />
        ) : (
          <View style={styles.list}>
            {BUILTIN_PACKS.map((pack) => {
              const isOwned = owned.includes(pack.id);
              const checked = isOwned || picked.includes(pack.id);
              return (
                <Pressable
                  key={pack.id}
                  style={({pressed}) => [styles.pack, checked && styles.packChecked, pressed && !isOwned && styles.pressed]}
                  onPress={() => tap(pack.id)}
                  disabled={isOwned}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked, disabled: isOwned}}
                  accessibilityLabel={`${PACK_NAMES[pack.id]}, ${habitCount(pack.templates.length)}: ${pack.templates.map((t) => TEMPLATE_NAMES[t]).join(', ')}`}>
                  <View style={styles.packHeader}>
                    <View style={styles.packTitle}>
                      <Text style={styles.packName}>{PACK_NAMES[pack.id]}</Text>
                      <Text style={styles.packCount}>{habitCount(pack.templates.length)}</Text>
                    </View>
                    <MaterialCommunityIcons
                      name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                      size={24}
                      color={checked ? (isOwned ? colors.muted : colors.accent) : colors.muted}
                    />
                  </View>
                  {pack.templates.map((t) => (
                    <Text key={t} style={styles.habit} numberOfLines={2}>{TEMPLATE_NAMES[t]}</Text>
                  ))}
                </Pressable>
              );
            })}
          </View>
        )}

        {limitLevel !== null && (
          <Text style={styles.limit} accessibilityLiveRegion="polite">{packLimitMessage(limitLevel)}</Text>
        )}

        <Pressable
          style={({pressed}) => [styles.save, (!canSave || pressed) && styles.saveOff]}
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{disabled: !canSave, busy: saving}}>
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{SAVE_PACKS}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  backRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  backText: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.muted},
  title: {fontFamily: fonts.title, fontSize: 32, color: colors.text, marginTop: spacing.lg},
  note: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: spacing.sm},
  loading: {marginTop: spacing.xxl},
  list: {gap: spacing.sm, marginTop: spacing.xl},
  pack: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.habitCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  packChecked: {borderColor: colors.accent},
  packHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 2},
  packTitle: {flex: 1, gap: 1},
  packName: {fontFamily: fonts.title, fontSize: 16, color: colors.text},
  packCount: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  habit: {fontFamily: fonts.regular, fontSize: 13, color: colors.text},
  pressed: {opacity: 0.85},
  limit: {fontFamily: fonts.medium, fontSize: 13, color: colors.error, marginTop: spacing.lg, textAlign: 'center'},
  save: {
    height: 56,
    marginTop: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: {opacity: 0.5},
  saveText: {fontFamily: fonts.title, fontSize: 16, color: colors.white},
});
