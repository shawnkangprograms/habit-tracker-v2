import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts} from '@/constants/theme';
import {needsCareText, strongestText} from '@/utils/radar/copy';
import {highlights, type RadarWindow} from '@/utils/radar/score';

// "Strongest: ..." and, when it applies, "Needs care: ..." for the radar's window: the two lines the compact radar card
// on Home carried, now above Progress's radar (the card is gone). Nothing while the window is still "starting" (the
// radar says so itself) or when no area has a score yet.
export function RadarHighlights({window}: {window: RadarWindow}) {
  if (window.starting) return null;
  const {strongest, needsCare} = highlights(window);
  if (!strongest && !needsCare) return null;
  return (
    <View style={styles.wrap}>
      {strongest && <Text style={styles.line}>{strongestText(strongest.axis, strongest.percent)}</Text>}
      {needsCare && <Text style={styles.line}>{needsCareText(needsCare.axis, needsCare.percent)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 4},
  line: {fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.text},
});
