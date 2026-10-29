import {useCallback, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {FadeInDown, ReduceMotion} from 'react-native-reanimated';
import {getGamificationStats} from '@/db/gamification';// XP, level and streak, derived from local rows
import {onRemoteChange} from '@/db/remoteChanges';// data pulled from another device changed local rows
import {useSessionUid} from '@/services/session';
import {loadShared} from '@/services/statsStore';// shared with Home: reuse, join or load once
import {useStatsEntry} from '@/hooks/use-stats';
import {getLocalDateString} from '@/utils/dates';
import type {GamificationStats} from '@/utils/gamification';
import {medalStates} from '@/utils/medals';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {LevelBadge, XpBar} from '@/components/stats-card';
import {Medal} from '@/components/medal';

type LoadReason = 'focus' | 'remote';

// Dev only: shows whether Profile reused Home's stats, joined a running load, or read the database itself
function storeLog(message: string) {
  if (__DEV__) console.log(`Stats store: ${message}`);
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export default function ProfileScreen() {
  const userId = useSessionUid() ?? undefined;// this screen is only reachable while signed in (presumed or confirmed)
  const entry = useStatsEntry();
  const stats = entry && entry.userId === userId ? entry.stats : null;
  const [failed, setFailed] = useState(false);// the last load failed and nothing is shown: one quiet line

  // No database work when the store already has today's stats from Home
  const refresh = useCallback(async (reason: LoadReason) => {
    if (!userId) return;
    const startedAt = performance.now();
    const result = await loadShared(userId, getLocalDateString(), () => getGamificationStats(userId) as Promise<GamificationStats>);
    const ms = Math.round(performance.now() - startedAt);
    if (result.source === 'reused') storeLog('reused');
    else if (result.source === 'joined') storeLog(`joined in-flight (${reason}, ${ms} ms)`);
    else storeLog(`loaded (Profile, ${reason}) in ${ms} ms`);
    setFailed(result.entry === null);
  }, [userId]);

  // Remote-change reloads, coalesced like Home's: one runs at a time, and changes arriving meanwhile
  // cause one more run after it
  const remoteReload = useRef({running: false, again: false});
  const reloadForRemote = useCallback(async () => {
    const state = remoteReload.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        await refresh('remote');
      } while (state.again);
    } finally {
      state.running = false;
    }
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    refresh('focus');
    // while focused, data pulled from another device updates Profile and the tab icon in place
    return onRemoteChange(reloadForRemote);
  }, [refresh, reloadForRemote]));

  const medals = useMemo(() => medalStates(stats?.longestStreak ?? 0), [stats?.longestStreak]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile.</Text>

        {!stats && failed && (
          <Text style={styles.empty}>Your stats couldn&apos;t be loaded. They&apos;ll try again next time you open this tab.</Text>
        )}

        {stats && (
          <>
            <View style={[styles.card, styles.levelCard]}>
              <LevelBadge level={stats.level} size={56} />
              <View style={styles.levelMiddle}>
                <Text style={styles.levelText}>Level {stats.level}</Text>
                <XpBar progress={stats.progress} xpIntoLevel={stats.xpIntoLevel} xpForNextLevel={stats.xpForNextLevel} />
              </View>
            </View>

            <View
              style={[styles.card, styles.streakCard]}
              accessible
              accessibilityLabel={`Current streak ${days(stats.currentStreak)}. Longest ${days(stats.longestStreak)}`}>
              <MaterialCommunityIcons name="fire" size={40} color={colors.accent} />
              <View>
                <Text style={styles.streakText}>{days(stats.currentStreak)} streak</Text>
                <Text style={styles.muted}>Longest: {days(stats.longestStreak)}</Text>
              </View>
            </View>

            <Text style={styles.section}>Medals</Text>
            <View style={[styles.card, styles.shelf]}>
              {medals.map((m, i) => (
                // appears once when the shelf first mounts (tabs stay mounted); instant under reduce motion
                <Animated.View
                  key={m.days}
                  style={styles.medalCell}
                  entering={FadeInDown.duration(250).delay(i * 50).reduceMotion(ReduceMotion.System)}>
                  <Medal days={m.days} tier={m.tier} earned={m.earned} daysToGo={m.daysToGo} />
                </Animated.View>
              ))}
            </View>

            <Text style={styles.section}>Lifetime</Text>
            <View style={styles.tiles}>
              <Tile value={stats.totalXp} label="Total XP" />
              <Tile value={stats.longestStreak} label="Longest streak" />
              <Tile value={stats.perfectDays} label="Perfect days" />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({value, label}: {value: number; label: string}) {
  return (
    <View style={[styles.card, styles.tile]} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  content: {paddingHorizontal: spacing.lg, paddingBottom: 18, gap: 10},
  title: {fontFamily: fonts.title, fontSize: 26, color: colors.text, paddingTop: 5},
  empty: {fontFamily: fonts.regular, fontSize: 14, color: colors.muted},
  card: {
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md},
  levelMiddle: {flex: 1, gap: 5},
  levelText: {fontFamily: fonts.title, fontSize: 16, color: colors.text},
  streakCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md},
  streakText: {fontFamily: fonts.title, fontSize: 20, color: colors.text},
  muted: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
  section: {fontFamily: fonts.title, fontSize: 18, color: colors.text, paddingTop: spacing.sm},
  shelf: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, paddingVertical: spacing.lg},
  medalCell: {width: '33.333%', alignItems: 'center'},
  tiles: {flexDirection: 'row', gap: spacing.sm},
  tile: {flex: 1, padding: spacing.md, gap: 2},
  tileValue: {fontFamily: fonts.title, fontSize: 22, color: colors.text},
  tileLabel: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
});
