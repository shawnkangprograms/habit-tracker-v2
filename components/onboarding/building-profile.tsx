import {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import {colors, fonts, spacing} from '@/constants/theme';
import {ProgressRing} from '@/components/progress-ring';
import {BUILDING_ROWS, BUILDING_TITLE, QUOTES, nextQuote, statusWord} from '@/utils/onboarding/copy';
import {
  BUILDING_DURATION_MS, BUILDING_HOLD_MS, BUILDING_REDUCED_HOLD_MS, BUILDING_TICK_MS, QUOTE_IN_MS, QUOTE_MS,
  QUOTE_OUT_MS, READY_SCALE, READY_SETTLE_HALF_MS, ROW_TICK_HALF_MS, canStartQuoteSwap, shouldAnimate,
} from '@/utils/onboarding/motion';

// Building Profile (docs/ONBOARDING_SPEC.md, section 5): the ring counts 0 to 100% over about 2.5 s, the four
// rows tick in one after another, and a quote rotates below. The real work (one local read) is instant, so the
// wait is never stretched: it moves on as soon as it reaches 100% and the plan is ready. Under reduced motion
// it shows 100% at once and moves on after about 0.8 s.
//
// Motion (stage 4): each row's check pops as it ticks, quotes cross-fade, and at 100% the ring settles once
// while READY fades in, all inside the existing hold. The percentage counter is the one JS-timer animation here
// (from stage 3); everything new runs on the UI thread.

const ROW_DONE_AT = [25, 50, 75, 100];// percent at which each row ticks
const SYSTEM = ReduceMotion.System;// a backstop for the first render, before useReduceMotion has read the setting
const EASE = Easing.out(Easing.quad);

// Plain functions, so the React Compiler lint doesn't treat them as render-time reads
function firstQuote(): number {
  return nextQuote(null);
}
function clockNow(): number {
  return Date.now();
}

function RowCheck({done, animate}: {done: boolean; animate: boolean}) {
  const scale = useSharedValue(1);
  const wasDone = useRef(done);

  useEffect(() => {
    if (done && !wasDone.current && animate) {
      scale.set(withSequence(
        withTiming(0.6, {duration: 0, reduceMotion: SYSTEM}),
        withTiming(1.15, {duration: ROW_TICK_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
        withTiming(1, {duration: ROW_TICK_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
      ));
    }
    wasDone.current = done;
  }, [done, animate, scale]);

  const style = useAnimatedStyle(() => ({transform: [{scale: scale.get()}]}));
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons
        name={done ? 'check-circle' : 'circle-outline'}
        size={20}
        color={done ? colors.accent : colors.muted}
      />
    </Animated.View>
  );
}

export function BuildingProfile({reduceMotion, ready, onDone}: {
  reduceMotion: boolean;
  ready: boolean;// the plan has been built
  onDone: () => void;
}) {
  const animate = shouldAnimate(reduceMotion);
  const [percent, setPercent] = useState(0);
  const [quote, setQuote] = useState(firstQuote);
  const shown = reduceMotion ? 100 : percent;
  const complete = shown >= 100;
  const settle = useSharedValue(1);
  const readyOpacity = useSharedValue(1);
  const wasComplete = useRef(complete);

  useEffect(() => {
    if (reduceMotion) return;
    const startedAt = clockNow();
    const id = setInterval(() => {
      const p = Math.min(100, Math.round(((clockNow() - startedAt) / BUILDING_DURATION_MS) * 100));
      setPercent(p);
      if (p >= 100) clearInterval(id);
    }, BUILDING_TICK_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // A new quote only while a swap can finish before the count does (canStartQuoteSwap); the first "no" ends it.
  // Under reduced motion the count is already at 100%, so the first quote stays.
  useEffect(() => {
    if (reduceMotion) return;
    const startedAt = clockNow();
    const id = setInterval(() => {
      if (!canStartQuoteSwap(clockNow() - startedAt, false)) {
        clearInterval(id);
        return;
      }
      setQuote((q) => nextQuote(q));
    }, QUOTE_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // READY: one settle of the ring and a fade of the word, within the hold below (never extends it)
  useEffect(() => {
    if (complete && !wasComplete.current && animate) {
      settle.set(withSequence(
        withTiming(READY_SCALE, {duration: READY_SETTLE_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
        withTiming(1, {duration: READY_SETTLE_HALF_MS, easing: EASE, reduceMotion: SYSTEM}),
      ));
      readyOpacity.set(0);
      readyOpacity.set(withTiming(1, {duration: READY_SETTLE_HALF_MS * 2, reduceMotion: SYSTEM}));
    }
    wasComplete.current = complete;
  }, [complete, animate, settle, readyOpacity]);

  useEffect(() => {
    if (!complete || !ready) return;
    const timer = setTimeout(onDone, reduceMotion ? BUILDING_REDUCED_HOLD_MS : BUILDING_HOLD_MS);
    return () => clearTimeout(timer);
  }, [complete, ready, reduceMotion, onDone]);

  const ringStyle = useAnimatedStyle(() => ({transform: [{scale: settle.get()}]}));
  const statusStyle = useAnimatedStyle(() => ({opacity: readyOpacity.get()}));

  const q = QUOTES[quote];
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{BUILDING_TITLE}</Text>

      <Animated.View style={[styles.ring, ringStyle]} accessible accessibilityLabel={`${shown} percent, ${statusWord(shown)}`}>
        <ProgressRing progress={shown / 100} size={180} strokeWidth={12} color={colors.accent} durationMs={BUILDING_TICK_MS}>
          <Text style={styles.percent}>{shown}%</Text>
          <Animated.Text style={[styles.status, statusStyle]}>{statusWord(shown)}</Animated.Text>
        </ProgressRing>
      </Animated.View>

      <View style={styles.rows}>
        {BUILDING_ROWS.map((row, i) => {
          const done = shown >= ROW_DONE_AT[i];
          return (
            <View key={row} style={styles.row}>
              <RowCheck done={done} animate={animate} />
              <Text style={[styles.rowText, !done && styles.rowPending]}>{row}</Text>
            </View>
          );
        })}
      </View>

      {/* fixed height with the quotes stacked, so the cross-fade never shifts the layout */}
      <View style={styles.quoteBox}>
        <Animated.View
          key={quote}
          style={styles.quote}
          entering={animate ? FadeIn.duration(QUOTE_IN_MS).reduceMotion(SYSTEM) : undefined}
          exiting={animate ? FadeOut.duration(QUOTE_OUT_MS).reduceMotion(SYSTEM) : undefined}>
          <Text style={styles.quoteText}>{q.text}</Text>
          {q.english && <Text style={styles.quoteEnglish}>{q.english}</Text>}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.xl, alignItems: 'center'},
  title: {alignSelf: 'stretch', fontFamily: fonts.title, fontSize: 28, lineHeight: 36, color: colors.text},// see app/onboarding.tsx
  ring: {alignItems: 'center', justifyContent: 'center'},
  percent: {fontFamily: fonts.title, fontSize: 40, color: colors.text},
  status: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.accent},
  rows: {alignSelf: 'stretch', gap: spacing.md},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  rowText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  rowPending: {color: colors.muted},
  quoteBox: {alignSelf: 'stretch', height: 76, marginTop: spacing.sm},
  quote: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', gap: spacing.xs},
  quoteText: {fontFamily: fonts.medium, fontSize: 14, color: colors.text, textAlign: 'center'},
  quoteEnglish: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center'},
});
