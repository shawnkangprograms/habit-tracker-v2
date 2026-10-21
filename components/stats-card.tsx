import {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {ProgressRing} from '@/components/progress-ring';
import {colors, fonts, radii, spacing} from '@/constants/theme';

// Round level badge; also used on Profile at a larger size
export function LevelBadge(props: {level: number; size?: number}) {
  const size = props.size ?? 46;
  return (
    <View
      style={[styles.levelBadge, {width: size, height: size}]}
      accessibilityLabel={`Level ${props.level}`}>
      <Text style={[styles.levelNumber, {fontSize: Math.round(size * 0.39)}]}>{props.level}</Text>
    </View>
  );
}

// XP bar toward the next level, animated (jumps under the system reduce-motion setting), with "x / y XP" below
export function XpBar(props: {progress: number; xpIntoLevel: number; xpForNextLevel: number}) {
  const barProgress = useSharedValue(props.progress);

  useEffect(() => {
    barProgress.value = withTiming(props.progress, {duration: 400, reduceMotion: ReduceMotion.System});
  }, [props.progress, barProgress]);

  const fillStyle = useAnimatedStyle(() => ({width: `${Math.min(1, Math.max(0, barProgress.value)) * 100}%`}));

  return (
    <>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, fillStyle]} />
      </View>
      <Text style={styles.xpText}>{props.xpIntoLevel} / {props.xpForNextLevel} XP</Text>
    </>
  );
}

// Home header: level badge, XP bar toward the next level, current streak, and today's ring.
export function StatsCard(props: {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1 toward the next level
  currentStreak: number;
  doneToday: number;
  scheduledToday: number;
}) {
  const restDay = props.scheduledToday === 0;
  const streakLabel = `${props.currentStreak} day${props.currentStreak === 1 ? '' : 's'}`;

  return (
    <View style={styles.card}>
      <LevelBadge level={props.level} />

      <View style={styles.middle}>
        <View style={styles.row}>
          <Text style={styles.levelText}>Level {props.level}</Text>
          <View style={styles.streak} accessibilityLabel={`Current streak ${streakLabel}`}>
            <MaterialCommunityIcons name="fire" size={16} color={colors.accent} />
            <Text style={styles.streakText}>{streakLabel}</Text>
          </View>
        </View>
        <XpBar progress={props.progress} xpIntoLevel={props.xpIntoLevel} xpForNextLevel={props.xpForNextLevel} />
      </View>

      <View accessibilityLabel={restDay ? 'Rest day' : `${props.doneToday} of ${props.scheduledToday} habits done today`}>
        <ProgressRing
          progress={restDay ? 0 : props.doneToday / props.scheduledToday}
          size={54}
          strokeWidth={5}
          color={restDay ? colors.muted : colors.green}>
          <Text style={[styles.ringText, restDay && styles.ringTextRest]}>
            {restDay ? 'Rest\nday' : `${props.doneToday}/${props.scheduledToday}`}
          </Text>
        </ProgressRing>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelBadge: {
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accent + '26', // ~15% opacity, like the auth logo badge
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {fontFamily: fonts.title, color: colors.text},
  middle: {flex: 1, gap: 5},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  levelText: {fontFamily: fonts.title, fontSize: 14, color: colors.text},
  streak: {flexDirection: 'row', alignItems: 'center', gap: 2},
  streakText: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.text},
  barTrack: {height: 8, borderRadius: radii.pill, backgroundColor: colors.track, overflow: 'hidden'},
  barFill: {height: '100%', borderRadius: radii.pill, backgroundColor: colors.accent},
  xpText: {fontFamily: fonts.regular, fontSize: 11, color: colors.muted},
  ringText: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.text},
  ringTextRest: {fontSize: 9, lineHeight: 11, color: colors.muted, textAlign: 'center'},
});
