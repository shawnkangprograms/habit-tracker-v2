import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fonts} from '@/constants/theme';
import {AwardBadge} from '@/components/award-badge';
import {daysToGoLabel, type MedalTier} from '@/utils/medals';

// One streak medal (the Progress shelf and the celebration overlay): the streak frame of the awards (C4) with the day
// count on its solid face in colors.onAccent ink. Locked medals are grey with a lock and "N days to go". The spoken
// label and the caption are the ones the medal always had.
export const Medal = memo(function Medal(props: {
  days: number;
  tier: MedalTier;
  earned: boolean;
  daysToGo: number;
  size?: number;
}) {
  const {days, tier, earned, daysToGo} = props;
  const size = props.size ?? 84;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${days}-day medal, ${earned ? 'earned' : `locked, ${daysToGoLabel(daysToGo)}`}`}>
      <AwardBadge group="streaks" tier={tier} earned={earned} centre={{kind: 'number', text: String(days)}} size={size} />
      <Text style={[styles.caption, earned && styles.captionEarned]}>
        {earned ? `${days} days` : daysToGoLabel(daysToGo)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', gap: 4},
  caption: {fontFamily: fonts.medium, fontSize: 11, color: colors.muted, textAlign: 'center'},
  captionEarned: {color: colors.text},
});
