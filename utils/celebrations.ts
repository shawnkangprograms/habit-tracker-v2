// Celebrations and encouragement after the user's own tick on Home. Pure: no React, database or storage.
// Rewards are deterministic and tied to real achievements from the derived engine (utils/gamification.ts):
// the wording rotates, the outcome never does. Nothing here is stored; the "already celebrated" set is passed in.
//
// Order of use (hooks/use-celebrations.ts): diffTick -> celebrationsFor -> (early check) -> pickSituation
// -> texts from a message picker -> tickItems -> enqueue.

import {
  diffStats as engineDiff, PERFECT_DAY_XP, STREAK_MILESTONES, type GamificationStats,
} from '@/utils/gamification';
import {MEDAL_TIERS, type MedalTier} from '@/utils/medals';

// ---------- What one tick changed ----------

export type TickInput = {
  before: GamificationStats;// the store's entry before the tick
  after: GamificationStats;// the stats Home loaded after the tick
  doneToday: number;// from the rows loadHabits just loaded
  scheduledToday: number;
};

export type TickDiff = {
  levelUp: number | null;// the new level
  levelsCrossed: number[];// every level reached by this tick (a big milestone bonus can jump several)
  streakMilestone: number | null;// the highest milestone the LONGEST streak crossed
  streakMilestonesCrossed: number[];
  perfectDay: boolean;// today became perfect
  firstHabitEver: boolean;
  firstHabitToday: boolean;
  habitsLeftToday: number;
  xpToNextLevel: number;
  nextLevel: number;
  currentStreak: number;
  longestStreak: number;
  comeback: boolean;// first tick after a broken streak
  streakDay: number | null;// the streak grew to this many days (2 or more)
};

// null when this was not a completing tick (no completion was added), e.g. an un-tick: nothing to react to
export function diffTick({before, after, doneToday, scheduledToday}: TickInput): TickDiff | null {
  if (after.completionXp <= before.completionXp) return null;
  const engine = engineDiff(before, after);
  const crossed = [...engine.newBadges].sort((a, b) => a - b);
  const levelsCrossed: number[] = [];
  for (let level = before.level + 1; level <= after.level; level++) levelsCrossed.push(level);

  return {
    levelUp: engine.levelUp ? after.level : null,
    levelsCrossed,
    streakMilestone: crossed.length > 0 ? crossed[crossed.length - 1] : null,
    streakMilestonesCrossed: crossed,
    perfectDay: engine.perfectDay,
    firstHabitEver: before.completionXp === 0,
    firstHabitToday: doneToday === 1,
    habitsLeftToday: Math.max(0, scheduledToday - doneToday),
    xpToNextLevel: after.xpForNextLevel - after.xpIntoLevel,
    nextLevel: after.level + 1,
    currentStreak: after.currentStreak,
    longestStreak: after.longestStreak,
    comeback: before.currentStreak === 0 && before.longestStreak > 0 && after.currentStreak === 1,
    streakDay: after.currentStreak > before.currentStreak && after.currentStreak >= 2 ? after.currentStreak : null,
  };
}

// ---------- Celebrations (once ever) ----------
// Keys: "level:N", "streak:N", "perfect:YYYY-MM-DD", plus "early:YYYY-MM-DD" for early praise.
// They live per uid on this device (services/celebratedStore.ts). A fresh phone starts with an empty set, so a
// past milestone can be celebrated once more if the user's own tick crosses it again. Accepted.

export const levelKey = (level: number) => `level:${level}`;
export const streakKey = (days: number) => `streak:${days}`;
export const perfectKey = (date: string) => `perfect:${date}`;
export const earlyKey = (date: string) => `early:${date}`;

export type Celebration =
  | {kind: 'levelUp'; level: number}
  | {kind: 'streak'; days: number; tier: MedalTier}
  | {kind: 'perfectDay'; currentStreak: number};

export function tierFor(days: number): MedalTier {
  const i = STREAK_MILESTONES.findIndex((m) => m.days === days);
  return MEDAL_TIERS[i >= 0 ? i : 0];
}

// Reached again (e.g. un-tick then re-tick) but already celebrated: a quiet toast instead of the overlay or
// banner. Nothing is marked for these.
export type Repeat = 'repeatLevel' | 'repeatMedal' | 'repeatPerfect';

// In priority order: level up, streak milestone, perfect day. Already-celebrated ones are left out of
// `celebrations` and listed in `repeats` (same order) instead.
// `keys` are the keys to mark now (at enqueue time): every newly crossed level and milestone, even those
// not shown (only the highest milestone is celebrated), so none of them can come up again later.
export function celebrationsFor(
  diff: TickDiff,
  today: string,
  celebrated: ReadonlySet<string>,
): {celebrations: Celebration[]; keys: string[]; repeats: Repeat[]} {
  const celebrations: Celebration[] = [];
  const keys: string[] = [];
  const repeats: Repeat[] = [];

  if (diff.levelUp !== null) {
    if (!celebrated.has(levelKey(diff.levelUp))) celebrations.push({kind: 'levelUp', level: diff.levelUp});
    else repeats.push('repeatLevel');
    for (const level of diff.levelsCrossed) if (!celebrated.has(levelKey(level))) keys.push(levelKey(level));
  }

  const newMilestones = diff.streakMilestonesCrossed.filter((days) => !celebrated.has(streakKey(days)));
  if (newMilestones.length > 0) {
    const highest = newMilestones[newMilestones.length - 1];
    celebrations.push({kind: 'streak', days: highest, tier: tierFor(highest)});
    keys.push(...newMilestones.map(streakKey));
  } else if (diff.streakMilestone !== null) {
    repeats.push('repeatMedal');
  }

  if (diff.perfectDay && !celebrated.has(perfectKey(today))) {
    celebrations.push({kind: 'perfectDay', currentStreak: diff.currentStreak});
    keys.push(perfectKey(today));
  } else if (diff.perfectDay) {
    repeats.push('repeatPerfect');
  }
  return {celebrations, keys, repeats};
}

// ---------- Encouragement (toast) ----------

export type Situation =
  | Repeat
  | 'early' | 'comeback' | 'firstEver' | 'streakDay' | 'lastOne' | 'nearLevel' | 'progress' | 'firstToday';

export const NEAR_LEVEL_XP = 30;

// Every situation that applies, highest precedence first. Repeats (from celebrationsFor) come before
// everything else, in their own order: level, medal, perfect day.
export function situationsFor(diff: TickDiff, early: boolean, repeats: Repeat[] = []): Situation[] {
  const all: [Situation, boolean][] = [
    ['repeatLevel', repeats.includes('repeatLevel')],
    ['repeatMedal', repeats.includes('repeatMedal')],
    ['repeatPerfect', repeats.includes('repeatPerfect')],
    ['early', early],
    ['comeback', diff.comeback],
    ['firstEver', diff.firstHabitEver],
    ['streakDay', diff.streakDay !== null],
    ['lastOne', diff.habitsLeftToday === 1],
    ['nearLevel', diff.xpToNextLevel > 0 && diff.xpToNextLevel <= NEAR_LEVEL_XP],
    ['progress', diff.habitsLeftToday >= 2],
    ['firstToday', diff.firstHabitToday],
  ];
  return all.filter(([, applies]) => applies).map(([s]) => s);
}

export function pickSituation(diff: TickDiff, early: boolean, repeats: Repeat[] = []): Situation | null {
  return situationsFor(diff, early, repeats)[0] ?? null;
}

// ---------- Message bank ----------

export type MessageVars = {
  n: number;// habits left today
  xp: number;// XP to the next level
  level: number;// the next level (toasts) or the new level (overlay)
  d: number;// current streak, or the milestone days on the milestone overlay
  m: number | null;// next medal not yet earned (by longest streak); null when all are earned
  k: number;// days from the current streak to that medal
  firstMedal: boolean;// no medal earned yet
  bonus: number;// perfect-day XP
  tier: MedalTier;
  reachedLevel: number;// the level this tick reached (repeat toasts)
  milestone: number;// the medal this tick reached (repeat toasts); 0 if none
};

export type MessageKey = Situation | 'perfectDay' | 'levelUp' | 'streakMilestone';
type Variant = (v: MessageVars) => string | null;// null: this wording doesn't fit these numbers

const dayCount = (k: number) => (k === 1 ? 'one day' : `${k} days`);

export const MESSAGE_BANK: Record<MessageKey, Variant[]> = {
  repeatLevel: [
    (v) => `Back to level ${v.reachedLevel}.`,
    (v) => `Level ${v.reachedLevel} is yours again.`,
    (v) => `Level ${v.reachedLevel} again. Back where you were.`,
  ],
  repeatMedal: [
    (v) => `The ${v.milestone}-day medal is back.`,
    (v) => `${v.milestone}-day medal earned again.`,
    (v) => `Your ${v.milestone}-day medal is yours again.`,
  ],
  repeatPerfect: [
    () => 'Perfect day again. Every habit done.',
    () => 'All done again. Perfect day.',
    () => 'Perfect day restored.',
  ],
  early: [
    () => 'Earlier than usual. Nice start.',
    () => 'Ahead of your usual time today.',
    () => 'Done earlier than you normally are. Good rhythm.',
    () => 'An early one today. Strong start.',
  ],
  comeback: [
    () => 'Welcome back. A new streak starts today.',
    () => 'Good to see you again. Day 1 of a new streak.',
    () => 'Back at it. Your new streak starts now.',
    () => 'Fresh start today. Every streak begins with day 1.',
  ],
  firstEver: [
    () => 'Your first habit is done. This is how it starts.',
    () => 'First one checked off. Welcome to HabitQuest.',
    () => "That's your first tick. Your streak starts today.",
  ],
  streakDay: [
    (v) => (v.m !== null && v.firstMedal ? `Day ${v.d}. Keep it going and you'll earn your first medal at 3 days.` : null),
    (v) => (v.m !== null ? `Day ${v.d} of your streak. ${v.k} more for the ${v.m}-day medal.` : null),
    (v) => (v.m !== null ? `${v.d} days in a row. The ${v.m}-day medal is ${dayCount(v.k)} away.` : null),
    (v) => (v.m !== null ? `Day ${v.d}. Steady progress toward the ${v.m}-day medal.` : null),
    (v) => (v.m === null ? `Day ${v.d} in a row. Steady.` : null),
    (v) => (v.m === null ? `${v.d} days straight. That's a habit now.` : null),
    (v) => (v.m === null ? `Day ${v.d}. Still going strong.` : null),
  ],
  lastOne: [
    () => 'One more for a perfect day.',
    () => 'Just one habit left today.',
    () => 'One to go. A perfect day is in reach.',
    () => 'Last one left for today.',
  ],
  nearLevel: [
    (v) => `Only ${v.xp} XP to level ${v.level}.`,
    (v) => `${v.xp} XP to go until level ${v.level}.`,
    (v) => `Level ${v.level} is ${v.xp} XP away.`,
    (v) => `Close now: ${v.xp} XP to level ${v.level}.`,
  ],
  progress: [
    (v) => `${v.n} to go for a perfect day.`,
    (v) => `${v.n} more and today is a perfect day.`,
    (v) => `Nice. ${v.n} left for today.`,
    (v) => `Good progress. ${v.n} habits left today.`,
  ],
  firstToday: [
    () => 'First one today. Good start.',
    () => "Today's first habit is done.",
    () => 'Today is underway.',
  ],
  perfectDay: [
    (v) => (v.d < 2 ? 'Perfect day. Every habit done.' : null),
    (v) => (v.d < 2 ? `All done for today. Perfect day, +${v.bonus} XP.` : null),
    (v) => (v.d < 2 ? 'Perfect day. Everything checked off.' : null),
    (v) => (v.d >= 2 ? `Perfect day. Day ${v.d} in a row.` : null),
    (v) => (v.d >= 2 ? `Perfect day, +${v.bonus} XP. Day ${v.d} of your streak.` : null),
    (v) => (v.d >= 2 ? `Every habit done. Day ${v.d} in a row.` : null),
  ],
  levelUp: [
    (v) => `You reached level ${v.level}.`,
    (v) => `Level ${v.level} unlocked. Your consistency is paying off.`,
    (v) => `Up to level ${v.level}. Keep the rhythm going.`,
  ],
  streakMilestone: [
    (v) => `You earned the ${v.tier} medal.`,
    (v) => `${v.d} days in a row. That's a real habit forming.`,
    (v) => `${v.d} days straight. The ${v.tier} medal is yours.`,
  ],
};

// The numbers a toast or banner talks about, from one tick's diff
export function messageVars(diff: TickDiff): MessageVars {
  const next = STREAK_MILESTONES.find((ms) => ms.days > diff.longestStreak);
  return {
    n: diff.habitsLeftToday,
    xp: diff.xpToNextLevel,
    level: diff.nextLevel,
    d: diff.currentStreak,
    m: next ? next.days : null,
    k: next ? next.days - diff.currentStreak : 0,
    firstMedal: diff.longestStreak < STREAK_MILESTONES[0].days,
    bonus: PERFECT_DAY_XP,
    tier: tierFor(STREAK_MILESTONES[0].days),
    reachedLevel: diff.levelUp ?? diff.nextLevel - 1,
    milestone: diff.streakMilestone ?? 0,
  };
}

// Rotates through each key's fitting wordings in order (deterministic) and never returns the text it
// returned last time, across all keys. Remembered in memory only, so one repeat is possible after a restart.
export function createMessagePicker(bank: Record<MessageKey, Variant[]> = MESSAGE_BANK) {
  const turns: Partial<Record<MessageKey, number>> = {};
  let lastText: string | null = null;

  return {
    pick(key: MessageKey, vars: MessageVars): string | null {
      const texts = bank[key].map((variant) => variant(vars)).filter((t): t is string => t !== null);
      if (texts.length === 0) return null;
      const start = turns[key] ?? 0;
      let offset = 0;
      if (texts.length > 1 && texts[start % texts.length] === lastText) offset = 1;
      const text = texts[(start + offset) % texts.length];
      turns[key] = start + offset + 1;
      lastText = text;
      return text;
    },
  };
}

// ---------- Queue ----------

export type QueueItem = {id: number} & (
  | {kind: 'levelUp'; level: number; title: string; body: string}
  | {kind: 'streak'; days: number; tier: MedalTier; title: string; body: string}
  | {kind: 'perfectDay'; text: string}
  | {kind: 'toast'; text: string; tappedAt?: number}// tappedAt: dev timing log only
);

type Picker = ReturnType<typeof createMessagePicker>;

// One tick's items: its celebrations in priority order, or else its toast (never both)
export function tickItems(
  celebrations: Celebration[],
  toastText: string | null,
  vars: MessageVars,
  picker: Picker,
  nextId: () => number,
): QueueItem[] {
  if (celebrations.length === 0) return toastText ? [{id: nextId(), kind: 'toast', text: toastText}] : [];
  return celebrations.map((c): QueueItem => {
    if (c.kind === 'levelUp') {
      return {id: nextId(), kind: 'levelUp', level: c.level, title: `Level ${c.level}`,
        body: picker.pick('levelUp', {...vars, level: c.level}) ?? ''};
    }
    if (c.kind === 'streak') {
      return {id: nextId(), kind: 'streak', days: c.days, tier: c.tier, title: `${c.days}-day streak`,
        body: picker.pick('streakMilestone', {...vars, d: c.days, tier: c.tier}) ?? ''};
    }
    return {id: nextId(), kind: 'perfectDay', text: picker.pick('perfectDay', {...vars, d: c.currentStreak}) ?? ''};
  });
}

// One item shows at a time, never stacked. Celebrations (overlays, perfect-day banner) queue in order.
// Toasts never wait: a newer tick's items drop every older toast, the one showing included, so a new toast
// replaces the current one at once, and only the latest tick's toast can ever be shown.
export function enqueue(queue: QueueItem[], items: QueueItem[]): QueueItem[] {
  return items.length === 0 ? queue : [...dropToasts(queue), ...items];
}

// Removes the item only if it is the one showing (a timer and a tap can both dismiss it)
export function dismissItem(queue: QueueItem[], id: number): QueueItem[] {
  return queue[0]?.id === id ? queue.slice(1) : queue;
}

// Leaving Home drops waiting toasts (they'd be out of date); celebrations wait for the user to come back
export function dropToasts(queue: QueueItem[]): QueueItem[] {
  return queue.some((item) => item.kind === 'toast') ? queue.filter((item) => item.kind !== 'toast') : queue;
}
