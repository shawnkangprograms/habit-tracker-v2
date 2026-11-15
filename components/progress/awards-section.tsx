import {router} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';
import {spacing} from '@/constants/theme';
import {TEST_IDS} from '@/constants/testIds';
import {AwardTile} from '@/components/award-tile';
import {sectionTitleStyle} from '@/components/progress/stats-blocks';
import {AppText} from '@/components/ui/app-text';
import {Button} from '@/components/ui/button';
import {AWARDS, nextToEarn, type AwardState} from '@/utils/awards';
import {ALL_EARNED_LINE, AWARDS_SECTION_TITLE, NEXT_UP_TITLE, SEE_ALL_AWARDS, earnedCountLine} from '@/utils/copy/awards';

// The Awards section on Progress (C4 Set 3): how many are earned, the next three to earn (nearest to done first), and
// "See all awards" for the /awards screen. Reads the awards from the stats Progress already has; computes nothing.
export function AwardsSection({awards}: {awards: readonly AwardState[]}) {
  const earned = awards.filter((a) => a.earned).length;
  const next = nextToEarn(awards);// 35 awards: cheap, and the React Compiler memoises it
  return (
    <View style={styles.wrap}>
      <Text style={sectionTitleStyle} accessibilityRole="header">{AWARDS_SECTION_TITLE}</Text>
      <AppText variant="small" color="muted">{earnedCountLine(earned, AWARDS.length)}</AppText>
      {next.length > 0 ? (
        <>
          <AppText variant="label" color="muted" accessibilityRole="header" style={styles.nextUp}>{NEXT_UP_TITLE}</AppText>
          {next.map((award) => <AwardTile key={award.id} award={award} row />)}
        </>
      ) : (
        <AppText variant="small" color="text">{ALL_EARNED_LINE}</AppText>
      )}
      <Button label={SEE_ALL_AWARDS} variant="secondary" size="md" onPress={() => router.push('/awards')} testID={TEST_IDS.awards.seeAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  nextUp: {marginTop: spacing.xs},
});
