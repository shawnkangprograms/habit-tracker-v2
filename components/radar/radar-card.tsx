import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import {COMPACT_SIZE, RadarDrawing} from '@/components/radar/radar-drawing';
import {WindowSwitch} from '@/components/radar/window-switch';
import {
  RADAR_CARD_HINT, RADAR_STARTING, RADAR_TITLE, WINDOW_CAPTION, needsCareText, radarA11yLabel, strongestText,
} from '@/utils/radar/copy';
import {highlights, type Radar, type RadarWindowId} from '@/utils/radar/score';

// Home's compact radar card (docs/PACKS_REPORTS_SPEC.md, section 11), below the habit lists. A fixed height in every
// state, so the placeholder (RadarCardPlaceholder) holds exactly its space at launch. Left: the small radar (no
// labels, no outline) with its window caption directly under it. Right: the title, "Strongest" and, when it
// applies, "Needs care", then the Week/Month switch. The radar and the text open Summary; the switch is its own
// control. TalkBack hears the whole radar in words (radarA11yLabel), never colour alone.

const CARD_HEIGHT = 2 * spacing.md + COMPACT_SIZE + 4 + 16;// padding, radar, gap, caption line

export function RadarCard({radar, window, onWindow, onOpen}: {
  radar: Radar;
  window: RadarWindowId;
  onWindow: (next: RadarWindowId) => void;
  onOpen: () => void;
}) {
  const current = radar[window];
  const {strongest, needsCare} = highlights(current);
  const label = radarA11yLabel(window, current.axes, current.starting);
  return (
    <View style={styles.card}>
      <Pressable
        style={({pressed}) => [styles.left, pressed && styles.pressed]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={RADAR_CARD_HINT}>
        <RadarDrawing window={current} compact />
        <Text style={styles.caption}>{WINDOW_CAPTION[window]}</Text>
      </Pressable>
      <View style={styles.right}>
        {/* the same action as the radar; TalkBack reaches it through the radar's button */}
        <Pressable
          style={({pressed}) => [styles.text, pressed && styles.pressed]}
          onPress={onOpen}
          accessible={false}
          importantForAccessibility="no-hide-descendants">
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{RADAR_TITLE}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </View>
          {current.starting ? (
            <Text style={styles.line} numberOfLines={2}>{RADAR_STARTING}</Text>
          ) : (
            <>
              {strongest && <Text style={styles.line} numberOfLines={1}>{strongestText(strongest.axis, strongest.percent)}</Text>}
              {needsCare && <Text style={styles.line} numberOfLines={1}>{needsCareText(needsCare.axis, needsCare.percent)}</Text>}
            </>
          )}
        </Pressable>
        <WindowSwitch value={window} onChange={onWindow} />
      </View>
    </View>
  );
}

// The card's exact space at launch, until the first stats load has finished: the same card, empty
export function RadarCardPlaceholder() {
  return <View style={styles.card} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.largeCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  left: {width: COMPACT_SIZE, gap: 4, alignItems: 'center'},
  caption: {fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.muted},
  right: {flex: 1, justifyContent: 'space-between'},
  text: {gap: 4},
  titleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {flex: 1, fontFamily: fonts.title, fontSize: 15, color: colors.text},
  line: {fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.text},
  pressed: {opacity: 0.85},
});
