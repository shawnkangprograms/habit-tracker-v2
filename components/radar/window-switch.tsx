import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii} from '@/constants/theme';
import {WINDOW_CAPTION, WINDOW_LABEL} from '@/utils/radar/copy';
import type {RadarWindowId} from '@/utils/radar/score';

const OPTIONS: RadarWindowId[] = ['week', 'month'];

// The compact Week | Month switch on Home's radar card (Summary uses its own Week/Month toggle; both set the same
// shared choice, hooks/use-radar-window.ts). Tabs with their selected state; small, with a generous hit area.
// The selected segment uses the background ink on accent, like Summary's toggle.
export function WindowSwitch({value, onChange}: {value: RadarWindowId; onChange: (next: RadarWindowId) => void}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {OPTIONS.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            style={[styles.segment, selected && styles.selected]}
            onPress={() => onChange(option)}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            accessibilityLabel={`${WINDOW_LABEL[option]}, ${WINDOW_CAPTION[option].toLowerCase()}`}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{WINDOW_LABEL[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {flexDirection: 'row', padding: 2, borderRadius: radii.pill, backgroundColor: colors.track, alignSelf: 'flex-start'},
  segment: {height: 28, paddingHorizontal: 12, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center'},
  selected: {backgroundColor: colors.accent},
  label: {fontFamily: fonts.semiBold, fontSize: 12, color: colors.muted},
  selectedLabel: {color: colors.background},
});
