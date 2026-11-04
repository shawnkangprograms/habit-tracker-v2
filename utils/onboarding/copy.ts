// Every onboarding string: titles and option labels (docs/ONBOARDING_SPEC.md, sections 1 and 8) and the copy
// tables (docs/ONBOARDING_COPY.md). Pure. tests/onboarding-copy.test.ts checks every table against both docs,
// the length limits, and that every enum value has a line, so change the docs and this file together.

import type {
  Axis, BadHabit, Challenge, DaysPattern, Derail, FocusArea, HabitsFeel, Occupation, ReplaceAnswer, Sleep,
  TemplateId, TimeBudget, Value,
} from '@/utils/onboarding/types';
import type {StepKey} from '@/utils/onboarding/flow';

// ---------- Questions ----------

export const SKIP_SETUP = 'Skip setup';
export const SKIP_THIS_ONE = 'Skip this one';
export const BACK = 'Back';
export const CONTINUE = 'Continue';
export const FIRST_STEP_NOTICE = 'Your answers stay on this phone. Skip anything you like.';
export const SETTINGS_ROW = 'Set up your plan';

// "STEP n OF 11" (n counts from 1)
export function stepLabel(n: number, count: number): string {
  return `STEP ${n} OF ${count}`;
}

export const STEP_TITLES: Record<StepKey, string> = {
  timeBudget: 'How much time can you give to habits on a normal day?',
  occupation: 'What best describes you right now?',
  habitsFeel: 'How do your habits feel right now?',
  focus: 'What needs the most attention right now?',
  challenge: "What's your biggest challenge?",
  derails: 'What usually derails your routine?',
  sleep: "How's your sleep right now?",
  days: 'How do your days usually look?',
  values: 'What matters most to you?',
  badHabit: 'What bad habit hurts you the most?',
  confidence: 'Can you stick with a daily routine for 7 days?',
};
export const STUDENT_CHALLENGE_TITLE = "What's your biggest learning challenge?";

export const STEP_HINTS: Partial<Record<StepKey, string>> = {
  timeBudget: "We'll keep your plan small enough to stick.",
  focus: 'Pick up to 3.',
  values: 'Pick up to 2.',
  badHabit: 'Optional.',
  confidence: "Be honest, there's no wrong answer.",
};

export const CONFIDENCE_LOW_LABEL = 'Not confident';
export const CONFIDENCE_HIGH_LABEL = 'Very confident';

export const TIME_BUDGET_LABELS: Record<TimeBudget, string> = {
  min5: 'About 5 minutes',
  min15: '10 to 15 minutes',
  min30: '20 to 30 minutes',
  min60: 'An hour or more',
};

export const OCCUPATION_LABELS: Record<Occupation, string> = {
  student: 'Student',
  early_career: 'Early in my career',
  mid_career: 'Mid-career',
  self_employed: 'Self-employed or building something',
  between_jobs: 'Between jobs',
};

export const HABITS_FEEL_LABELS: Record<HabitsFeel, string> = {
  thriving: 'On track and thriving',
  alright: 'Doing alright, not great',
  struggling: 'Struggling to keep up',
  overwhelmed: 'Overwhelmed and need help',
};

export const FOCUS_LABELS: Record<FocusArea, string> = {
  health: 'Health & fitness',
  mental: 'Mental wellbeing',
  career: 'Career & productivity',
  discipline: 'Discipline & habits',
  relationships: 'Relationships & social life',
  education: 'Education & learning',
};

export const CHALLENGE_LABELS: Record<Challenge, string> = {
  time: 'Time management',
  focus: 'Focus & distraction',
  procrastination: 'Procrastination',
  low_energy: 'Low energy throughout the day',
  balance: 'Work-life balance',
  study_focus: "Can't focus when studying",
  overwhelmed: 'Feeling overwhelmed',
  memory: 'Poor memory retention',
  study_motivation: 'No motivation to study',
};

export const DERAIL_LABELS: Record<Derail, string> = {
  stress: 'Stress',
  boredom: 'Boredom',
  low_motivation: 'Low motivation',
  environment: 'Bad environment',
  social_pressure: 'Social pressure',
};

export const SLEEP_LABELS: Record<Sleep, string> = {
  good: 'I sleep well and wake up refreshed',
  okay: "It's okay, could be better",
  struggle: 'I struggle with sleep regularly',
  irregular: 'My schedule is all over the place',
};

export const DAYS_LABELS: Record<DaysPattern, string> = {
  predictable: 'Very predictable, same routine daily',
  mostly: 'Mostly predictable, some surprises',
  weekly_change: 'Changes week to week',
  chaotic: 'Very chaotic right now',
};

export const VALUE_LABELS: Record<Value, string> = {
  health_energy: 'Health & energy',
  peace_of_mind: 'Peace of mind',
  achievement: 'Achievement & success',
  freedom: 'Freedom & independence',
  connection: 'Connection & belonging',
};

export const BAD_HABIT_LABELS: Record<BadHabit, string> = {
  phone_social: 'Phone & social media',
  porn: 'Pornography',
  smoking_vaping: 'Smoking or vaping',
  gaming: 'Gaming',
  junk_food: 'Junk food',
  alcohol: 'Alcohol',
  procrastination: 'Procrastination',
  other: "Something else, I'll add it myself",
};

// ---------- Starter habits (names must pass validateHabitName: 30 characters or fewer) ----------

export const TEMPLATE_NAMES: Record<TemplateId, string> = {
  walk20: 'Walk for 20 minutes',
  stretch10: 'Stretch for 10 minutes',
  water_meals: 'Drink water with each meal',
  lights_out: 'Lights out at a set time',
  screens_off: 'No screens 30 min before bed',
  breathe5: 'Breathe for 5 minutes',
  journal3: 'Write 3 lines in a journal',
  plan_top1: "Plan tomorrow's top task",
  focus25: 'One 25-minute focus block',
  study25: 'Study for 25 minutes',
  review10: 'Review notes for 10 minutes',
  skill15: 'Practise a skill 15 minutes',
  message_friend: 'Message someone you care about',
  family_time: 'Family meal or call',
  eat_produce: 'Eat one fruit or vegetable',
  make_bed: 'Make your bed',
  tidy5: 'Tidy your space for 5 minutes',
  set_out_essentials: "Set out tomorrow's essentials",
  work_win: 'Track one work win',
  reach_out: 'Reach out to one contact',
  read15: 'Read for 15 minutes',
  teach_back: 'Teach what you learned',
  thank_someone: 'Thank someone today',
  kind_act: 'Do one kind thing',
};

export const TEMPLATE_REASONS: Record<TemplateId, string> = {
  walk20: 'Light movement lifts energy and mood.',
  stretch10: 'Loosens a stiff body and resets your focus.',
  water_meals: 'An easy cue for steady energy all day.',
  lights_out: 'A fixed bedtime fixes your mornings too.',
  screens_off: 'Late screens keep your brain awake.',
  breathe5: 'Five slow minutes calm a racing mind.',
  journal3: 'Getting thoughts out makes them lighter.',
  plan_top1: 'Decide tonight so tomorrow starts easy.',
  focus25: 'One protected block beats a scattered day.',
  study25: 'A short timed session beats a long delayed one.',
  review10: 'A quick review is how memory sticks.',
  skill15: 'Small daily practice compounds into real skill.',
  message_friend: 'Connection grows from small, regular check-ins.',
  family_time: 'Time together is easy to skip and hard to regret.',
  eat_produce: 'One small swap that adds up over a week.',
  make_bed: 'A finished task before the day even starts.',
  tidy5: 'A clear space makes starting easier.',
  set_out_essentials: 'Fewer decisions in the morning rush.',
  work_win: 'Small wins are easy to forget. Write one down.',
  reach_out: 'One message keeps your network warm.',
  read15: 'A few pages a day add up to books a year.',
  teach_back: 'Explaining it is the fastest way to remember.',
  thank_someone: 'Saying thanks out loud lifts you both.',
  kind_act: 'Small kindness builds closer ties.',
};

// Neutral names for the sensitive answers (porn, smoking_vaping, alcohol), so a synced habit never reveals them
export const REPLACE_NAMES: Record<ReplaceAnswer, string> = {
  phone_social: 'Phone-free first hour',
  porn: 'Phone out of the bedroom',
  smoking_vaping: 'Fresh-air morning',
  gaming: 'Gaming stops at a set time',
  junk_food: 'Cook one real meal',
  alcohol: 'Clear-headed evening',
  procrastination: 'Start with just 5 minutes',
};

export const REPLACE_REASONS: Record<ReplaceAnswer, string> = {
  phone_social: 'Own the first hour before the feed does.',
  porn: 'Keeping it out of reach makes late nights easier.',
  smoking_vaping: 'Win the morning first; the rest gets easier.',
  gaming: 'A clear stop time keeps play fun, not draining.',
  junk_food: 'One real meal a day resets what you reach for.',
  alcohol: 'Clear evenings mean better sleep and mornings.',
  procrastination: 'Five minutes gets you past the hardest part.',
};

// ---------- What you told us ----------

export const CHALLENGE_CARD_LABEL = 'YOUR CHALLENGE';
export const RHYTHM_CARD_LABEL = 'YOUR RHYTHM';
export const DERAILS_CARD_LABEL = 'WHAT DERAILS YOU';

export const CHALLENGE_LINES: Record<Challenge, string> = {
  time: 'I never seem to have enough time.',
  focus: 'Distractions keep pulling me off track.',
  procrastination: "I put things off until it's almost too late.",
  low_energy: 'My energy runs out before the day does.',
  balance: 'Work and life fight over the same hours.',
  study_focus: 'I sit down to study and my mind wanders.',
  overwhelmed: "There's so much to learn that I freeze.",
  memory: "I study hard, but it doesn't stick.",
  study_motivation: "I can't find the drive to open the books.",
};

export const RHYTHM_LINES: Record<DaysPattern, string> = {
  predictable: 'My days run on a steady routine.',
  mostly: 'My days mostly hold together, with a few surprises.',
  weekly_change: 'Every week looks a little different.',
  chaotic: 'Right now my days feel unpredictable.',
};

export const DERAIL_LINES: Record<Derail, string> = {
  stress: 'When stress hits, my routine is the first thing to go.',
  boredom: 'When I get bored, I drift off my plan.',
  low_motivation: "Some days the motivation just isn't there.",
  environment: 'My surroundings make good habits harder.',
  social_pressure: "Other people's plans pull me off mine.",
};

// ---------- Habit Profile ----------

export const FOCUS_CARDS: Record<Axis, {displayName: string; subtitle: string}> = {
  Discipline: {
    displayName: 'Discipline & Habits',
    subtitle: 'Small, repeatable wins help you rebuild momentum without overloading your day.',
  },
  Health: {
    displayName: 'Health & Energy',
    subtitle: 'Gentle daily movement, sleep and food habits to build steady energy.',
  },
  Mind: {
    displayName: 'Mind & Calm',
    subtitle: 'Short, calming habits to quiet your head and sharpen your focus.',
  },
  Career: {
    displayName: 'Career & Growth',
    subtitle: 'Focused work blocks and skill-building to move your goals forward.',
  },
  Learning: {
    displayName: 'Learning & Study',
    subtitle: 'Short, regular study sessions that help knowledge stick.',
  },
  Relations: {
    displayName: 'Relationships & Belonging',
    subtitle: 'Small, regular moments of connection with the people who matter.',
  },
};

export function focusTitle(axis: Axis): string {
  return `Your plan will focus on ${FOCUS_CARDS[axis].displayName}`;
}

// ---------- Building Profile ----------

export const BUILDING_TITLE = 'Building your habit profile.';
export const BUILDING_ROWS = [
  'Scanning your answers', 'Mapping your focus areas', 'Detecting your habit type', 'Preparing your plan',
] as const;

// The word under the percentage: 0-89 BUILDING, 90-99 ALMOST THERE, 100 READY
export function statusWord(percent: number): string {
  if (percent >= 100) return 'READY';
  if (percent >= 90) return 'ALMOST THERE';
  return 'BUILDING';
}

// ---------- Day-1 moves (optional) ----------

export type Day1Move = {when: 'Tonight' | 'Tomorrow' | 'This week'; title: string; line: string};

export const DAY1_MOVES: Record<Axis, Day1Move[]> = {
  Health: [
    {when: 'Tonight', title: 'Set out your walking shoes', line: "Remove tomorrow's first excuse."},
    {when: 'Tomorrow', title: 'Walk for 20 minutes', line: 'Any pace counts.'},
    {when: 'This week', title: 'Pick a fixed bedtime', line: 'Same time, even on weekends.'},
  ],
  Mind: [
    {when: 'Tonight', title: "Write down what's on your mind", line: 'Three lines is enough.'},
    {when: 'Tomorrow', title: 'Breathe for 5 minutes', line: 'Before you check your phone.'},
    {when: 'This week', title: 'Choose a daily quiet moment', line: 'Same time each day.'},
  ],
  Discipline: [
    {when: 'Tonight', title: "Pick tomorrow's one task", line: 'Decide now, not in the morning.'},
    {when: 'Tomorrow', title: 'Do that task first', line: 'Before messages and social media.'},
    {when: 'This week', title: 'Choose a daily cut-off time', line: 'A clear end makes starting easier.'},
  ],
  Career: [
    {when: 'Tonight', title: 'Write your goal for the week', line: 'One sentence is enough.'},
    {when: 'Tomorrow', title: 'One 25-minute focus block', line: 'Phone in another room.'},
    {when: 'This week', title: 'Practise one skill daily', line: 'Fifteen minutes is plenty.'},
  ],
  Learning: [
    {when: 'Tonight', title: 'Pick what to study first', line: 'Start with the hardest topic.'},
    {when: 'Tomorrow', title: 'Study for 25 minutes', line: 'One timer, one subject.'},
    {when: 'This week', title: 'Review your notes twice', line: 'Short reviews beat cramming.'},
  ],
  Relations: [
    {when: 'Tonight', title: 'Think of someone to reach out to', line: 'Just one person.'},
    {when: 'Tomorrow', title: 'Send that message', line: 'A short hello counts.'},
    {when: 'This week', title: 'Plan one shared meal or call', line: 'Put it in your diary.'},
  ],
};

// ---------- Result screens: strings the docs don't define yet ----------
// Short, factual, no claims. "Add your own habit" and "Start" are from the spec (section 5). The rest are
// proposed here until they are added to docs/ONBOARDING_COPY.md.

export const TOLD_US_TITLE = 'What you told us';
export const DAY1_TITLE = 'Your first moves';
export const PROFILE_TITLE = 'Your habit profile';
export const ROUTINE_TITLE = 'Your recommended routine';
export const ROUTINE_HINT = 'Tap a habit to leave it out.';
export const ROUTINE_REMINDER_LABEL = 'Daily reminder';
export const ADD_OWN_HABIT = 'Add your own habit';
export const START = 'Start';
export const DONE = 'Done';
export const ADDED = 'Added';
export const OWN_HABIT_REASON = 'Your own habit';// the reason line of a habit the user made in the habit form
export const NOTHING_LEFT = "You already have every habit we'd suggest for these answers.";
export const CREATE_FAILED = "Couldn't add every habit. The ones marked Added are saved. Tap Start to try the rest.";
export const ROUTINE_OTHER_GROUP = 'Other habits';// picks that join no pack, and the user's own habits

// Under the routine title when the run uses both chosen packs (utils/packs/choose.ts)
export function routineSubtitle(packA: string, packB: string): string {
  return `Built from your packs: ${packA} and ${packB}.`;
}

// The "Skip setup" confirmation (utils/onboarding/skipDialog.ts): Skip before any habit exists, Leave after
export const SKIP_TITLE = 'Skip setup?';
export const SKIP_BODY = "We won't be able to generate habits for you.";
export const SKIP_YES = 'Yes, skip';
export const SKIP_NO = 'No, continue';
export const LEAVE_TITLE = 'Leave setup?';
export const LEAVE_BODY = "The habits you've added are saved.";
export const LEAVE_YES = 'Yes, leave';
export const LEAVE_NO = 'No, stay';
export const LEAVING_NOTICE = 'Taking you home. You can set up your plan any time in Settings.';
export const GO_HOME = 'Go home';

// ---------- Loading quotes ----------

// A Swahili proverb has its English line, shown underneath in smaller text
export type Quote = {text: string; english?: string};

export const QUOTES: Quote[] = [
  {text: 'Small steps still leave footprints.'},
  {text: 'Skip the perfect plan. Start the ugly one.'},
  {text: "Today's five minutes is tomorrow's momentum."},
  {text: 'Streaks are built on ordinary Tuesdays.'},
  {text: "You don't need more motivation, just a smaller first step."},
  {text: 'Missed a day? The next one is a fresh page.'},
  {text: 'Consistency is quiet, and it adds up loudly.'},
  {text: 'Progress has no speed limit, only a direction.'},
  {text: 'One checked box can change the mood of a whole day.'},
  {text: 'Tired is a reason to go slower, not to stop.'},
  {text: 'Rest is part of the plan, not a break from it.'},
  {text: 'Do it badly, then do it again tomorrow.'},
  {text: 'Starting late still beats not starting.'},
  {text: 'Tiny habits, patient weeks, surprising results.'},
  {text: "Doing it now is a gift to tomorrow's you."},
  {text: 'Energy follows action more often than the other way round.'},
  {text: 'A calm start makes a clearer day.'},
  {text: 'Nobody remembers the perfect streak, only the comeback.'},
  {text: 'Slow days still count toward the total.'},
  {text: 'Good routines are boring on purpose.'},
  {text: "Your phone can wait ten minutes. Your goals can't wait forever."},
  {text: 'Water first, scrolling second.'},
  {text: "Today you only need to beat yesterday's excuse."},
  {text: 'Win the morning, and the afternoon gets easier.'},
  {text: 'Three habits done well beat ten abandoned.'},
  {text: 'Stack a new habit on one you already keep.'},
  {text: 'Plan tonight, relax tomorrow.'},
  {text: 'Every level starts with a first quest.'},
  {text: 'Even heroes begin with a single tap.'},
  {text: "Your best streak is the one you're on today."},
  {text: 'Be a little better than your last attempt.'},
  {text: 'Ordinary effort, repeated, looks like talent from far away.'},
  // Traditional methali: have a fluent speaker confirm the wording before release
  {text: 'Haba na haba hujaza kibaba.', english: 'Little by little fills the measure.'},
  {text: 'Polepole ndio mwendo.', english: 'Slowly is the way to go.'},
  {text: 'Mwenye subira hula mbivu.', english: 'The patient one eats ripe fruit.'},
  {text: 'Penye nia pana njia.', english: 'Where there is a will, there is a way.'},
  {text: 'Ukiona vyaelea, vimeundwa.', english: 'What you see afloat was built.'},
  {text: 'Bandu bandu huisha gogo.', english: 'Chip by chip, the log is finished.'},
  {text: 'Subira huvuta heri.', english: 'Patience draws good fortune.'},
  {text: 'Mwanzo wa ngoma ni lele.', english: 'Every big dance starts with a small step.'},
];

// A random quote index, never the one just shown. `random` returns [0, 1), like Math.random.
export function nextQuote(previous: number | null, random: () => number = Math.random): number {
  if (previous === null || QUOTES.length < 2) return Math.floor(random() * QUOTES.length);
  const i = Math.floor(random() * (QUOTES.length - 1));
  return i >= previous ? i + 1 : i;
}
