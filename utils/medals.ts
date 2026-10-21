// Streak medals for the Profile shelf: one per STREAK_MILESTONES entry, earned from the LONGEST streak.
// Pure: no React or database. Earned state comes from earnedBadges, so the shelf can't disagree with the engine.

import {STREAK_MILESTONES, earnedBadges} from '@/utils/gamification';

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'emerald' | 'ruby' | 'blaze';

// Material per milestone, in STREAK_MILESTONES order: 3, 7, 14, 30, 60, 100 days
export const MEDAL_TIERS: readonly MedalTier[] = ['bronze', 'silver', 'gold', 'emerald', 'ruby', 'blaze'];

export type MedalState = {days: number; tier: MedalTier; earned: boolean; daysToGo: number};

export function medalStates(longestStreak: number): MedalState[] {
  const longest = Number.isFinite(longestStreak) && longestStreak > 0 ? Math.floor(longestStreak) : 0;
  const earned = earnedBadges(longest);
  return STREAK_MILESTONES.map((m, i) => ({
    days: m.days,
    tier: MEDAL_TIERS[i],
    earned: earned.includes(m.days),
    daysToGo: Math.max(0, m.days - longest),
  }));
}

// Streak number on the Profile tab icon: "999+" from 1000 days, so it never outgrows the flame
export function streakIconLabel(streak: number): string {
  return streak >= 1000 ? '999+' : String(streak);
}

// "1 day to go" / "4 days to go"
export function daysToGoLabel(daysToGo: number): string {
  return `${daysToGo} day${daysToGo === 1 ? '' : 's'} to go`;
}
