import {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {colors, fonts, radii} from '@/constants/theme';
import {
  VITALITY_BAND_TEXT, VITALITY_LABEL, VITALITY_MAX, vitalityA11yLabel, vitalityStartingA11yLabel, vitalityStartingText,
  vitalityValueText, type Vitality,
} from '@/utils/vitality';

// Vitality on Home's stats card (docs/PACKS_REPORTS_SPEC.md, section 13): one text line (label and value on the
// left, the band message on the right, always one line) and a full-width bar under it. The same height in every
// state, so the card never changes size; before the first closed day the message says when it starts and the
// track is empty. The fill moves with scaleX from the left (transform only), and jumps under reduce motion.
// Not tappable. Green, or amber below 25 (orange is the XP bar's).
export function VitalityBar({vitality}: {vitality: Vitality}) {
  const ready = vitality.state === 'ready';
  const share = ready ? vitality.value / VITALITY_MAX : 0;
  const fill = useSharedValue(share);

  useEffect(() => {
    fill.value = withTiming(share, {duration: 400, reduceMotion: ReduceMotion.System});
  }, [share, fill]);

  const fillStyle = useAnimatedStyle(() => ({transform: [{scaleX: Math.min(1, Math.max(0, fill.value))}]}));

  return (
    <View style={styles.wrap}>
      <View
        style={styles.line}
        accessible={!ready}
        accessibilityLabel={ready ? undefined : vitalityStartingA11yLabel(vitality.restarts)}>
        {ready ? (
          <View style={styles.value} accessible accessibilityLabel={vitalityA11yLabel(vitality.value)}>
            <Text style={styles.label}>{VITALITY_LABEL}</Text>
            <Text style={styles.number}>{vitalityValueText(vitality.value)}</Text>
          </View>
        ) : (
          <Text style={styles.label}>{VITALITY_LABEL}</Text>
        )}
        <Text style={styles.message} numberOfLines={1} ellipsizeMode="tail">
          {ready ? VITALITY_BAND_TEXT[vitality.band] : vitalityStartingText(vitality.restarts)}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, ready && vitality.band === 'low' && styles.fillLow, fillStyle]} />
      </View>
    </View>
  );
}

const LINE = 16;

const styles = StyleSheet.create({
  wrap: {gap: 4},
  line: {flexDirection: 'row', alignItems: 'center', gap: 8},
  value: {flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0},
  // one line height for every text, so the line is the same height in every state (and scales with font size alike)
  label: {fontFamily: fonts.semiBold, fontSize: 11, lineHeight: LINE, color: colors.muted, flexShrink: 0},
  number: {fontFamily: fonts.semiBold, fontSize: 12, lineHeight: LINE, color: colors.text},
  message: {flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: LINE, color: colors.muted, textAlign: 'right'},
  track: {height: 6, borderRadius: radii.pill, backgroundColor: colors.track, overflow: 'hidden'},
  fill: {height: '100%', width: '100%', borderRadius: radii.pill, backgroundColor: colors.green, transformOrigin: 'left'},
  fillLow: {backgroundColor: colors.amber},
});
