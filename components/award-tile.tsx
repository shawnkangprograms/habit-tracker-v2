import {memo} from 'react';
import {StyleSheet, View} from 'react-native';
import {colors, radii, spacing} from '@/constants/theme';
import {awardTileId} from '@/constants/testIds';
import {AwardBadge} from '@/components/award-badge';
import {AppText} from '@/components/ui/app-text';
import {awardCentre} from '@/utils/awardArt';
import type {AwardView} from '@/utils/awards';
import {AWARD_COPY, awardSpokenLabel, lockedHint} from '@/utils/copy/awards';

// One award with its name and a line under it: what earned it, or (locked) how far is still to go. Read out as one
// item from awardSpokenLabel ("Perfect week, gold award, earned." / "Perfect week, locked. 3 more ... to go."), so the
// state is in words; the badge's lock and grey material show it without colour too. `row`: badge left, text right
// (the Progress section); otherwise the badge above the text (the /awards grid).
export const AwardTile = memo(function AwardTile({award, row = false}: {award: AwardView; row?: boolean}) {
  const {state} = award;
  const copy = AWARD_COPY[award.id];
  return (
    <View
      style={row ? styles.row : styles.tile}
      accessible
      accessibilityLabel={awardSpokenLabel(award.id, award.tier, state.earned, state.remaining)}
      testID={awardTileId(award.id)}>
      <AwardBadge group={award.group} tier={award.tier} ornament={award.ornament} earned={state.earned}
        centre={awardCentre(award)} size={row ? 52 : 72} />
      <View style={row ? styles.rowText : styles.tileText}>
        <AppText variant="small" weight="semiBold" color={state.earned ? 'text' : 'muted'} style={!row && styles.center}>{copy.name}</AppText>
        <AppText variant="caption" color="muted" style={!row && styles.center}>
          {state.earned ? copy.earned : lockedHint(award.id, state.remaining)}
        </AppText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radii.largeCard, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  rowText: {flex: 1, gap: 2},
  tile: {width: '50%', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm},
  tileText: {alignItems: 'center', gap: 2},
  center: {textAlign: 'center'},
});
