import {memo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fonts, radii, spacing} from '@/constants/theme';
import type {SummaryRange} from '@/utils/summary';

const OPTIONS: {value: SummaryRange; label: string; spoken: string}[] = [
  {value: 'week', label: 'Week', spoken: 'Week, last 7 days'},
  {value: 'month', label: 'Month', spoken: 'Month, last 30 days'},
];

// Week | Month segmented control. Each segment is a tab with its selected state; 48 dp minimum height.
// The selected segment uses the background ink on accent (5.75:1); white on accent is only 3.08:1.
export const RangeToggle = memo(function RangeToggle({value, onChange}: {
  value: SummaryRange;
  onChange: (range: SummaryRange) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={({pressed}) => [styles.segment, selected && styles.selected, pressed && !selected && styles.pressed]}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            accessibilityLabel={o.spoken}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {backgroundColor: colors.accent},
  pressed: {backgroundColor: colors.track},
  label: {fontFamily: fonts.semiBold, fontSize: 15, color: colors.muted, textAlign: 'center'},
  selectedLabel: {color: colors.background},
});
