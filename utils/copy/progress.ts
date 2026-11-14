// The words on the Progress screen, which merges the old Summary and Profile screens (C2, Set 2). Moved here from
// app/(tabs)/summary.tsx and app/(tabs)/profile.tsx with no change of wording; "Progress." is the one new text.
// Pure: no imports. The radar's own words stay in utils/radar/copy.ts.

export const PROGRESS_TITLE = 'Progress.';

// one quiet line per load that failed with nothing to show (each load has its own)
export const SUMMARY_FAILED_LINE = "Your summary couldn't be loaded. It'll try again next time you open this tab.";
export const STATS_FAILED_LINE = "Your stats couldn't be loaded. They'll try again next time you open this tab.";

export const LAST_7_DAYS_TITLE = 'Last 7 days';
export const LAST_30_DAYS_TITLE = 'Last 30 days';
export const BY_HABIT_TITLE = 'By habit';
export const MEDALS_TITLE = 'Medals';
export const LIFETIME_TITLE = 'Lifetime';

export const TOTAL_XP_LABEL = 'Total XP';
export const LONGEST_STREAK_LABEL = 'Longest streak';
export const PERFECT_DAYS_LABEL = 'Perfect days';

export const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
export const levelText = (level: number) => `Level ${level}`;
export const streakText = (current: number) => `${days(current)} streak`;
export const longestText = (longest: number) => `Longest: ${days(longest)}`;
export const streakA11yLabel = (current: number, longest: number) => `Current streak ${days(current)}. Longest ${days(longest)}`;
export const tileA11yLabel = (label: string, value: number) => `${label} ${value}`;
