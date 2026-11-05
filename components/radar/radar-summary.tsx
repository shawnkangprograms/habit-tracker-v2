import {StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {RadarDrawing} from '@/components/radar/radar-drawing';
import type {Outline} from '@/services/profileOutlineStoreCore';
import {RADAR_STARTING, WINDOW_CAPTION, axisDetail, axisValue, radarA11yLabel} from '@/utils/radar/copy';
import type {RadarWindow} from '@/utils/radar/score';

// Summary's full radar (docs/PACKS_REPORTS_SPEC.md, section 11): the labelled radar with the starting outline
// behind it (when one is stored), its window caption directly under it, then one row per area in the radar's order
// with its value or state in words. The window is chosen with Summary's own Week/Month toggle (shared with Home's
// card). Before any closed day has a scheduled habit it shows only "Starts after your first full day.".

export function RadarSummary({window, outline, contentWidth}: {
  window: RadarWindow;
  outline: Outline | null;
  contentWidth?: number;// the drawing width; defaults to the screen width minus Summary's side padding
}) {
  const {width: screenWidth} = useWindowDimensions();
  const width = contentWidth ?? screenWidth - 2 * spacing.lg;
  const caption = WINDOW_CAPTION[window.window];

  if (window.starting) {
    return (
      <View style={styles.card} accessible accessibilityLabel={radarA11yLabel(window.window, window.axes, true)}>
        <Text style={styles.starting}>{RADAR_STARTING}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View accessible accessibilityRole="image" accessibilityLabel={radarA11yLabel(window.window, window.axes, false)}>
        <RadarDrawing window={window} width={width} outline={outline} />
        <Text style={[styles.caption, styles.center]}>{caption}</Text>
      </View>
      <View style={styles.list}>
        {window.axes.map((a) => {
          const detail = axisDetail(a);
          return (
            <View key={a.axis} style={styles.row} accessible>
              <Text style={styles.area}>{a.axis}</Text>
              <Text style={[styles.value, a.state !== 'score' && styles.muted]}>{axisValue(a)}</Text>
              {detail && <Text style={styles.detail}>{detail}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.md},
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  starting: {fontFamily: fonts.medium, fontSize: 14, color: colors.text},
  caption: {fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.muted},
  center: {textAlign: 'center', marginTop: spacing.xs},
  list: {borderRadius: radii.largeCard, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  area: {flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
  value: {fontFamily: fonts.semiBold, fontSize: 14, color: colors.text},
  muted: {fontFamily: fonts.regular, color: colors.muted},
  detail: {minWidth: 56, textAlign: 'right', fontFamily: fonts.regular, fontSize: 12, color: colors.muted},
});
