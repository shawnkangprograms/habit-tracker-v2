// When Home offers a reflection, and whether a new one would pay (docs/PACKS_REPORTS_SPEC.md, section 16). Pure.
// The XP itself is derived in utils/gamification.ts (rewardedReflections); this only looks ahead with the same rule:
// a reflection pays while its habit is ticked that day, the earliest MAX_REWARDED_REFLECTIONS_PER_DAY a day.
// A new reflection is always the latest saved, so it pays exactly when fewer than the cap already count.

import {MAX_REWARDED_REFLECTIONS_PER_DAY} from '@/utils/gamification';
import {findReflection, type ReflectionsRecord} from '@/utils/reflections/record';

// Rewards still open that day. ticked: the habitIds whose completion that day is ticked.
export function rewardsLeft(record: ReflectionsRecord, date: string, ticked: ReadonlySet<string>): number {
  const counted = Object.keys(record.days[date] ?? {}).filter((habitId) => ticked.has(habitId)).length;
  return Math.max(0, MAX_REWARDED_REFLECTIONS_PER_DAY - counted);
}

// A new reflection on this habit and day would earn XP: the habit is ticked, has no reflection yet, and a
// reward is still open. Home offers the bar only when this holds.
export function wouldReward(
  record: ReflectionsRecord,
  input: {habitId: string; date: string; ticked: ReadonlySet<string>},
): boolean {
  return input.ticked.has(input.habitId)
    && !findReflection(record, input.habitId, input.date)
    && rewardsLeft(record, input.date, input.ticked) > 0;
}
