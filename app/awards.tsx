import {memo} from 'react';
import {router} from 'expo-router';
import {Pressable, SectionList, StyleSheet, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, spacing} from '@/constants/theme';
import {TEST_IDS, awardGroupId} from '@/constants/testIds';
import {useProgressStats} from '@/hooks/use-progress-stats';
import {AwardTile} from '@/components/award-tile';
import {AppText} from '@/components/ui/app-text';
import {Screen} from '@/components/ui/screen';
import {AWARDS, awardSections, awardsByGroup, type AwardGroup, type AwardRow} from '@/utils/awards';
import {
  AWARD_GROUP_LABELS, AWARDS_BACK, AWARDS_FAILED_LINE, AWARDS_SCREEN_TITLE, earnedCountLine,
} from '@/utils/copy/awards';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/progress');
}

// Only the first few rows are drawn at once (each badge is an SVG with gradients; the Itel is a low-end phone):
// about one screen, and more as the list scrolls
const INITIAL_ROWS = 4;

// One row of tiles; memoised, and each AwardTile is memoised too, so a scroll never redraws badges already drawn
const TileRow = memo(function TileRow({row}: {row: AwardRow}) {
  return (
    <View style={styles.grid}>
      {row.awards.map((award) => <AwardTile key={award.id} award={award} />)}
    </View>
  );
});

function GroupHeader({group}: {group: AwardGroup}) {
  return (
    <View style={styles.group}>
      <AppText variant="label" color="muted" accessibilityRole="header" testID={awardGroupId(group)}>{AWARD_GROUP_LABELS[group]}</AppText>
    </View>
  );
}

// Every award, by group (C4 Set 3): earned ones in their material with what earned them, locked ones grey with how far
// is still to go. The awards come from the same shared stats as Progress (hooks/use-progress-stats.ts: the store Home
// fills, reloaded on focus and on remote changes); nothing is computed here. A virtualised SectionList, so only the
// rows near the screen are drawn.
export default function AwardsScreen() {
  const {stats, failed} = useProgressStats();
  const awards = stats?.awards ?? null;
  const earned = awards ? awards.filter((a) => a.earned).length : 0;
  const sections = awards ? awardSections(awardsByGroup(awards)) : [];

  const header = (
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={goBack} hitSlop={12} accessibilityRole="button" testID={TEST_IDS.awards.back}>
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        <AppText variant="body" weight="semiBold" color="muted">{AWARDS_BACK}</AppText>
      </Pressable>
      <AppText variant="display" weight="title" accessibilityRole="header">{AWARDS_SCREEN_TITLE}</AppText>

      {!awards && failed && <AppText variant="body" color="muted">{AWARDS_FAILED_LINE}</AppText>}
      {awards && <AppText variant="small" color="muted">{earnedCountLine(earned, AWARDS.length)}</AppText>}
    </View>
  );

  return (
    <Screen testID={TEST_IDS.awards.screen} scroll={false} edges={['top', 'left', 'right', 'bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        renderItem={({item}) => <TileRow row={item} />}
        renderSectionHeader={({section}) => <GroupHeader group={section.group} />}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        initialNumToRender={INITIAL_ROWS}
        maxToRenderPerBatch={INITIAL_ROWS}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl},
  header: {gap: spacing.md},
  back: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  group: {marginTop: spacing.md, paddingBottom: spacing.sm},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
});
