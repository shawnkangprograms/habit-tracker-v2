import {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, spacing} from '@/constants/theme';
import {ProgressRing} from '@/components/progress-ring';
import {BUILDING_ROWS, BUILDING_TITLE, QUOTES, nextQuote, statusWord} from '@/utils/onboarding/copy';

// Building Profile (docs/ONBOARDING_SPEC.md, section 5): the ring counts 0 to 100% over about 2.5 s, the four
// rows tick in one after another, and a quote rotates below. The real work (one local read) is instant, so the
// wait is never stretched: it moves on as soon as it reaches 100% and the plan is ready. Under reduced motion
// it shows 100% at once and moves on after about 0.8 s. Stage 4 polishes the motion.

const DURATION_MS = 2500;
const TICK_MS = 100;
const QUOTE_MS = 2500;
const HOLD_MS = 300;// at 100%, so READY can be seen
const REDUCED_HOLD_MS = 800;
const ROW_DONE_AT = [25, 50, 75, 100];// percent at which each row ticks

// Plain functions, so the React Compiler lint doesn't treat them as render-time reads
function firstQuote(): number {
  return nextQuote(null);
}
function clockNow(): number {
  return Date.now();
}

export function BuildingProfile({reduceMotion, ready, onDone}: {
  reduceMotion: boolean;
  ready: boolean;// the plan has been built
  onDone: () => void;
}) {
  const [percent, setPercent] = useState(0);
  const [quote, setQuote] = useState(firstQuote);
  const shown = reduceMotion ? 100 : percent;

  useEffect(() => {
    if (reduceMotion) return;
    const startedAt = clockNow();
    const id = setInterval(() => {
      const p = Math.min(100, Math.round(((clockNow() - startedAt) / DURATION_MS) * 100));
      setPercent(p);
      if (p >= 100) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    const id = setInterval(() => setQuote((q) => nextQuote(q)), QUOTE_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (shown < 100 || !ready) return;
    const timer = setTimeout(onDone, reduceMotion ? REDUCED_HOLD_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [shown, ready, reduceMotion, onDone]);

  const q = QUOTES[quote];
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">{BUILDING_TITLE}</Text>

      <View style={styles.ring} accessible accessibilityLabel={`${shown} percent, ${statusWord(shown)}`}>
        <ProgressRing progress={shown / 100} size={180} strokeWidth={12} color={colors.accent}>
          <Text style={styles.percent}>{shown}%</Text>
          <Text style={styles.status}>{statusWord(shown)}</Text>
        </ProgressRing>
      </View>

      <View style={styles.rows}>
        {BUILDING_ROWS.map((row, i) => {
          const done = shown >= ROW_DONE_AT[i];
          return (
            <View key={row} style={styles.row}>
              <MaterialCommunityIcons
                name={done ? 'check-circle' : 'circle-outline'}
                size={20}
                color={done ? colors.accent : colors.muted}
              />
              <Text style={[styles.rowText, !done && styles.rowPending]}>{row}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.quote}>
        <Text style={styles.quoteText}>{q.text}</Text>
        {q.english && <Text style={styles.quoteEnglish}>{q.english}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.xl, alignItems: 'center'},
  title: {alignSelf: 'stretch', fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: colors.text},
  ring: {alignItems: 'center', justifyContent: 'center'},
  percent: {fontFamily: fonts.title, fontSize: 40, color: colors.text},
  status: {fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.accent},
  rows: {alignSelf: 'stretch', gap: spacing.md},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  rowText: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.text},
  rowPending: {color: colors.muted},
  quote: {alignSelf: 'stretch', gap: spacing.xs, paddingTop: spacing.sm},
  quoteText: {fontFamily: fonts.medium, fontSize: 14, color: colors.text, textAlign: 'center'},
  quoteEnglish: {fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center'},
});
