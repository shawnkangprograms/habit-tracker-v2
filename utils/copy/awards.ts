// The words for the awards (C4), written as Questy: text only, one or two short sentences, second person, plain and
// specific words, praise for the effort and never guilt, at most one exclamation mark, no emoji, encouraging hints.
// One entry per award in utils/awards.ts; tests/awards-set.test.ts checks every id has all of it and keeps the voice
// rules. Pure: a type import only.
import type {AwardGroup, AwardId} from '@/utils/awards';
import type {MedalTier} from '@/utils/medals';

export const AWARD_GROUP_LABELS: Record<AwardGroup, string> = {
  streaks: 'Streaks',
  perfect: 'Perfect days',
  volume: 'Ticks',
  consistency: 'Steady',
  comebacks: 'Comebacks',
  mastery: 'One habit',
  variety: 'Variety',
  time: 'Time',
};

// name: the award's title. earned: the line after "New award: <name>." and under an earned award. how: what earns it,
// under a locked one. unit: what the locked hint counts ("3 more perfect days to go"), singular and plural; null
// when the award is not a count (the hint is then "Locked for now." and the how line).
type Copy = {name: string; earned: string; how: string; unit: readonly [string, string] | null};

const DAY = ['day', 'days'] as const;
const TICK = ['tick', 'ticks'] as const;
const PERFECT_DAY = ['perfect day', 'perfect days'] as const;
const PERFECT_IN_A_ROW = ['perfect day in a row', 'perfect days in a row'] as const;
const HABIT = ['habit', 'habits'] as const;
const AREA = ['area', 'areas'] as const;
const IN_A_ROW = ['in a row', 'in a row'] as const;// one habit: "3 more in a row to go"

export const AWARD_COPY: Record<AwardId, Copy> = {
  streak_3: {name: '3-day streak', earned: 'Three days in a row. A real start.', how: 'Keep a streak going for 3 days.', unit: DAY},
  streak_7: {name: '7-day streak', earned: 'A full week, every day. Nicely kept.', how: 'Keep a streak going for 7 days.', unit: DAY},
  streak_14: {name: '14-day streak', earned: 'Two weeks straight. This is turning into a habit.', how: 'Keep a streak going for 14 days.', unit: DAY},
  streak_30: {name: '30-day streak', earned: 'A whole month without a break. Well done.', how: 'Keep a streak going for 30 days.', unit: DAY},
  streak_60: {name: '60-day streak', earned: 'Sixty days. You keep showing up.', how: 'Keep a streak going for 60 days.', unit: DAY},
  streak_100: {name: '100-day streak', earned: 'A hundred days in a row. That is rare.', how: 'Keep a streak going for 100 days.', unit: DAY},
  streak_200: {name: 'Two hundred', earned: 'Two hundred days in a row. Steady and strong.', how: 'Keep a streak going for 200 days.', unit: DAY},
  streak_365: {name: 'A whole year', earned: 'A full year, every single day. Remarkable!', how: 'Keep a streak going for 365 days.', unit: DAY},
  perfect_1: {name: 'First perfect day', earned: 'Everything you planned today, done.', how: 'Tick every habit planned for one day.', unit: PERFECT_DAY},
  perfect_7: {name: 'Seven perfect days', earned: 'Seven days with nothing left undone.', how: 'Have 7 days with every planned habit ticked.', unit: PERFECT_DAY},
  perfect_30: {name: 'Thirty perfect days', earned: 'Thirty days where you did it all.', how: 'Have 30 days with every planned habit ticked.', unit: PERFECT_DAY},
  perfect_100: {name: 'A hundred perfect days', earned: 'A hundred days of doing everything you set out to do.', how: 'Have 100 days with every planned habit ticked.', unit: PERFECT_DAY},
  perfect_run_3: {name: 'Hat trick', earned: 'Three perfect days in a row. Nicely done.', how: 'Have 3 perfect days in a row.', unit: PERFECT_IN_A_ROW},
  perfect_run_7: {name: 'Perfect week', earned: 'Seven days, nothing missed.', how: 'Have 7 perfect days in a row.', unit: PERFECT_IN_A_ROW},
  done_10: {name: '10 ticks', earned: 'Ten habits done. Every one of them counts.', how: 'Tick 10 habits.', unit: TICK},
  done_50: {name: '50 ticks', earned: 'Fifty ticks. Small steps, adding up.', how: 'Tick 50 habits.', unit: TICK},
  done_100: {name: '100 ticks', earned: 'A hundred ticks. You are building something.', how: 'Tick 100 habits.', unit: TICK},
  done_250: {name: '250 ticks', earned: 'Two hundred and fifty ticks. That is real work.', how: 'Tick 250 habits.', unit: TICK},
  done_500: {name: '500 ticks', earned: 'Five hundred ticks. Look how far you have come.', how: 'Tick 500 habits.', unit: TICK},
  done_1000: {name: '1,000 ticks', earned: 'A thousand ticks. Every one of them was you.', how: 'Tick 1,000 habits.', unit: TICK},
  weekend_done: {name: 'Weekend done', earned: 'A whole weekend, everything ticked.', how: 'Tick every planned habit on a Saturday and the Sunday after.', unit: null},
  steady_week: {name: 'Steady week', earned: 'Most of your week, done. Steady counts.', how: 'Tick at least 80% of your planned habits over 7 days.', unit: null},
  steady_month: {name: 'Steady month', earned: 'A steady month. That is how habits stick.', how: 'Tick at least 80% of your planned habits over 30 days.', unit: null},
  never_twice: {name: 'Never twice', earned: 'Thirty days and you never missed two in a row.', how: 'Go 30 days without missing two days in a row.', unit: null},
  comeback: {name: 'Back again', earned: 'Back again. That counts for a lot.', how: 'Come back and tick a habit after a few days away.', unit: null},
  habit_streak_7: {name: 'One habit, 7 days', earned: 'One habit, seven times in a row.', how: 'Do one habit 7 times in a row.', unit: IN_A_ROW},
  habit_streak_30: {name: 'One habit, 30 days', earned: 'One habit, thirty times in a row. It is part of you now.', how: 'Do one habit 30 times in a row.', unit: IN_A_ROW},
  habit_streak_66: {name: 'One habit, 66 days', earned: 'Sixty-six in a row. This one sticks.', how: 'Do one habit 66 times in a row.', unit: IN_A_ROW},
  habits_5: {name: 'Five going', earned: 'Five habits on the go. A full plate, well kept.', how: 'Have 5 habits going at once.', unit: HABIT},
  areas_3: {name: 'Three areas', earned: 'Habits in three parts of your life.', how: 'Have habits in 3 different areas.', unit: AREA},
  areas_6: {name: 'All six', earned: 'Something in every area. A well-rounded week.', how: 'Have habits in all 6 areas.', unit: AREA},
  days_7: {name: 'One week in', earned: 'A week with HabitQuest. Glad you are here.', how: 'Stay with it for a week.', unit: DAY},
  days_30: {name: 'A month in', earned: 'A month with HabitQuest. You stuck with it.', how: 'Stay with it for a month.', unit: DAY},
  days_100: {name: '100 days in', earned: 'A hundred days with HabitQuest. Thank you for staying.', how: 'Stay with it for 100 days.', unit: DAY},
  days_365: {name: 'A year in', earned: 'A whole year with HabitQuest. What a year.', how: 'Stay with it for a year.', unit: DAY},
};

// The toast when a tick earns a new award (C4 Set 3): "New award: Perfect week. Seven days, nothing missed."
export const newAwardLine = (id: AwardId) => `New award: ${AWARD_COPY[id].name}. ${AWARD_COPY[id].earned}`;

// A whole number with a comma between thousands ("1,000"), written by hand: toLocaleString depends on the phone's
// locale and on the JS engine's locale data
export function formatCount(n: number): string {
  const digits = String(Math.trunc(Math.abs(n)));
  return (n < 0 ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Under a locked award: "Locked for now. 3 more perfect days to go." for a count, else "Locked for now." and how.
export const LOCKED_PREFIX = 'Locked for now.';
export function lockedHint(id: AwardId, remaining: number | null): string {
  const copy = AWARD_COPY[id];
  if (copy.unit === null || remaining === null || remaining < 1) return `${LOCKED_PREFIX} ${copy.how}`;
  return `${LOCKED_PREFIX} ${formatCount(remaining)} more ${remaining === 1 ? copy.unit[0] : copy.unit[1]} to go.`;
}

// The material, as TalkBack says it
export const TIER_LABELS: Record<MedalTier, string> = {
  bronze: 'bronze', silver: 'silver', gold: 'gold', emerald: 'emerald', ruby: 'ruby', blaze: 'blaze',
};

// What a screen reader says for one award (C4 Set 3 tiles): "Perfect week, gold award, earned." or
// "Perfect week, locked. 3 more perfect days in a row to go." The state is in words, never colour alone.
export function awardSpokenLabel(id: AwardId, tier: MedalTier, earned: boolean, remaining: number | null): string {
  const name = AWARD_COPY[id].name;
  if (earned) return `${name}, ${TIER_LABELS[tier]} award, earned.`;
  return `${name}, locked. ${lockedHint(id, remaining).slice(LOCKED_PREFIX.length + 1)}`;
}

// The Awards section on Progress and the /awards screen (C4 Set 3)
export const AWARDS_SECTION_TITLE = 'Awards';
export const earnedCountLine = (earned: number, total: number) => `${earned} of ${total} earned`;
export const NEXT_UP_TITLE = 'Next up';
export const ALL_EARNED_LINE = 'You have earned every award. That is a lot of showing up.';
export const SEE_ALL_AWARDS = 'See all awards';
export const AWARDS_SCREEN_TITLE = 'Awards.';
export const AWARDS_BACK = 'Progress';
export const AWARDS_FAILED_LINE = "Your awards couldn't be loaded. They'll try again next time you open this screen.";
