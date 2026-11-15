import {router} from 'expo-router';
import {Pressable, StyleSheet, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {colors, spacing} from '@/constants/theme';
import {TEST_IDS, awardGroupId} from '@/constants/testIds';
import {useProgressStats} from '@/hooks/use-progress-stats';
import {AwardTile} from '@/components/award-tile';
import {AppText} from '@/components/ui/app-text';
import {Screen} from '@/components/ui/screen';
import {AWARDS, awardsByGroup} from '@/utils/awards';
import {
  AWARD_GROUP_LABELS, AWARDS_BACK, AWARDS_FAILED_LINE, AWARDS_SCREEN_TITLE, earnedCountLine,
} from '@/utils/copy/awards';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/progress');
}

// Every award, by group (C4 Set 3): earned ones in their material with what earned them, locked ones grey with how far
// is still to go. The awards come from the same shared stats as Progress (hooks/use-progress-stats.ts: the store Home
// fills, reloaded on focus and on remote changes); nothing is computed here.
export default function AwardsScreen() {
  const {stats, failed} = useProgressStats();
  const awards = stats?.awards ?? null;
  const earned = awards ? awards.filter((a) => a.earned).length : 0;

  return (
    <Screen testID={TEST_IDS.awards.screen} edges={['top', 'left', 'right', 'bottom']} padding={spacing.lg} gap={spacing.md}
      contentStyle={styles.content}>
      <Pressable style={styles.back} onPress={goBack} hitSlop={12} accessibilityRole="button" testID={TEST_IDS.awards.back}>
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        <AppText variant="body" weight="semiBold" color="muted">{AWARDS_BACK}</AppText>
      </Pressable>
      <AppText variant="display" weight="title" accessibilityRole="header">{AWARDS_SCREEN_TITLE}</AppText>

      {!awards && failed && <AppText variant="body" color="muted">{AWARDS_FAILED_LINE}</AppText>}
      {awards && <AppText variant="small" color="muted">{earnedCountLine(earned, AWARDS.length)}</AppText>}
      {awards && awardsByGroup(awards).map(({group, awards: list}) => (
        <View key={group} style={styles.group}>
          <AppText variant="label" color="muted" accessibilityRole="header" testID={awardGroupId(group)}>{AWARD_GROUP_LABELS[group]}</AppText>
          <View style={styles.grid}>
            {list.map((award) => <AwardTile key={award.id} award={award} />)}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xl},
  back: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: spacing.md, marginLeft: -6},
  group: {gap: spacing.sm, marginTop: spacing.sm},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
});
