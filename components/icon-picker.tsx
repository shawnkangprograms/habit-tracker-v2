import {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {colors, fonts, radii, spacing, ICON_COLORS} from '@/constants/theme';
import {ICON_IDS, type IconId} from '@/constants/habits';
import {TEST_IDS, iconTabId, iconTileId} from '@/constants/testIds';
import {HabitIcon} from '@/constants/habitIcons';
import {AppText} from '@/components/ui/app-text';
import {Pill} from '@/components/ui/pill';
import {
  captionFor, groupIcons, pickerMode, searchIcons, showUnknownLine, spokenLabel, startGroup, visibleGroups,
} from '@/utils/iconPicker';
import {
  ICON_GRID_LABEL, ICON_GROUP_LABELS, ICON_SEARCH_EMPTY, ICON_SEARCH_PLACEHOLDER, ICON_TABS_LABEL, ICON_UNKNOWN_LINE,
} from '@/utils/copy/icons';

// The habit icon picker (C3), shared by the habit form and the admin catalog form (components/habit-fields.tsx
// IconGrid). `selectable` defaults to ICON_IDS, which the release switch decides; tests pass their own.
// Flat mode (only the twelve of 1.0 can be picked): today's grid of twelve. Tabs mode: a search field above group tabs;
// a group with nothing selectable is hidden; typing searches every group, clearing returns to the group.
// Every tile is 52x52, a radio in a radio group, read out by its spoken label; the caption under the grid names the
// chosen icon. `stored` is the icon the habit already has when it isn't selectable: a set icon is named in the
// caption, an id this build has never heard of gets the "newer version" line (and is kept unless another is chosen).
export function IconPicker({value, onChange, stored = null, selectable = ICON_IDS}: {
  value: IconId | null;
  onChange: (id: IconId) => void;
  stored?: string | null;
  selectable?: readonly IconId[];
}) {
  const mode = pickerMode(selectable);
  const groups = useMemo(() => visibleGroups(selectable), [selectable]);
  const [group, setGroup] = useState(() => startGroup(value, selectable));
  const [query, setQuery] = useState('');
  // the habit loads after the first render (edit mode), and a pick from the search results may be in another group:
  // the tabs follow the chosen icon (adjusted during render, React's pattern for state derived from a prop)
  const [followed, setFollowed] = useState(value);
  if (value !== followed) {
    setFollowed(value);
    const own = value ? startGroup(value, selectable) : null;
    if (own) setGroup(own);
  }
  const searching = query.trim() !== '';

  const shown: IconId[] = useMemo(() => {
    if (mode === 'flat') return [...selectable];
    if (searching) return searchIcons(query, selectable);
    return group ? groupIcons(group, selectable) : [];
  }, [mode, searching, query, group, selectable]);

  const caption = captionFor(value, stored);

  return (
    <View>
      {mode === 'tabs' && (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={ICON_SEARCH_PLACEHOLDER}
            placeholderTextColor={colors.muted}
            accessibilityLabel={ICON_SEARCH_PLACEHOLDER}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.search}
            testID={TEST_IDS.icon.search}
          />
          {!searching && (
            // the form scrolls with the keyboard open: a tab tap must select, not just close the keyboard
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.tabsScroller}
              contentContainerStyle={styles.tabs}
              accessibilityRole="tablist"
              accessibilityLabel={ICON_TABS_LABEL}>
              {groups.map((g) => (
                <Pill
                  key={g}
                  label={ICON_GROUP_LABELS[g]}
                  selected={g === group}
                  onPress={() => setGroup(g)}
                  role="tab"
                  gap={spacing.sm}
                  testID={iconTabId(g)}
                />
              ))}
            </ScrollView>
          )}
        </>
      )}

      <View style={[styles.grid, mode === 'tabs' && styles.gridBelow]} accessibilityRole="radiogroup" accessibilityLabel={ICON_GRID_LABEL}>
        {shown.map((id) => {
          const selected = value === id;
          const tint = ICON_COLORS[id];
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              style={[styles.tile, selected && {borderWidth: 2, borderColor: tint, backgroundColor: tint + '30'}]}
              accessibilityRole="radio"
              accessibilityLabel={spokenLabel(id)}
              accessibilityState={{selected, checked: selected}}
              testID={iconTileId(id)}>
              <HabitIcon id={id} size={24} color={selected ? tint : colors.muted} />
            </Pressable>
          );
        })}
      </View>
      {searching && shown.length === 0 && (
        <AppText variant="small" color="muted" style={styles.line} accessibilityLiveRegion="polite">{ICON_SEARCH_EMPTY}</AppText>
      )}

      {caption && <AppText variant="small" weight="semiBold" color="text" style={styles.line}>{caption}</AppText>}
      {showUnknownLine(value, stored) && <AppText variant="small" color="muted" style={styles.line}>{ICON_UNKNOWN_LINE}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  tabsScroller: {marginTop: spacing.md, flexGrow: 0},
  tabs: {gap: spacing.sm, paddingBottom: spacing.xs},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.s10},
  gridBelow: {marginTop: spacing.md},
  tile: {
    width: 52,
    height: 52,
    borderRadius: radii.habitCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {marginTop: spacing.sm},
});
