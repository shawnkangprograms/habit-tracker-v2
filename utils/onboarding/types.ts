// Onboarding enums and answer types (docs/ONBOARDING_SPEC.md, sections 1 and 4). Pure: no React, storage or
// Firebase imports (eslint.config.js blocks them in every onboarding file). Enum lists are in the spec's order,
// which is also the order the option labels are shown in.

// Q1: time a normal day allows for habits. The age gate is on the sign-up form, so onboarding never asks age.
export const TIME_BUDGETS = ['min5', 'min15', 'min30', 'min60'] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

export const OCCUPATIONS = ['student', 'early_career', 'mid_career', 'self_employed', 'between_jobs'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const HABITS_FEEL = ['thriving', 'alright', 'struggling', 'overwhelmed'] as const;
export type HabitsFeel = (typeof HABITS_FEEL)[number];

export const FOCUS_AREAS = ['health', 'mental', 'career', 'discipline', 'relationships', 'education'] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

// Q5 shows one of two lists, chosen by Q2. procrastination is in both.
export const STUDENT_CHALLENGES = ['study_focus', 'procrastination', 'overwhelmed', 'memory', 'study_motivation'] as const;
export const GENERAL_CHALLENGES = ['time', 'focus', 'procrastination', 'low_energy', 'balance'] as const;
export const CHALLENGES = [
  'time', 'focus', 'procrastination', 'low_energy', 'balance', 'study_focus', 'overwhelmed', 'memory', 'study_motivation',
] as const;
export type Challenge = (typeof CHALLENGES)[number];
// Only in the student list: the values that add a Learning point (procrastination does not)
export const STUDENT_ONLY_CHALLENGES = ['study_focus', 'overwhelmed', 'memory', 'study_motivation'] as const;

export const DERAILS = ['stress', 'boredom', 'low_motivation', 'environment', 'social_pressure'] as const;
export type Derail = (typeof DERAILS)[number];

export const SLEEP = ['good', 'okay', 'struggle', 'irregular'] as const;
export type Sleep = (typeof SLEEP)[number];

export const DAYS = ['predictable', 'mostly', 'weekly_change', 'chaotic'] as const;
export type DaysPattern = (typeof DAYS)[number];

export const VALUES = ['health_energy', 'peace_of_mind', 'achievement', 'freedom', 'connection'] as const;
export type Value = (typeof VALUES)[number];

// Q10 is sensitive: held in memory only, never stored and never part of an id (spec section 2)
export const BAD_HABITS = [
  'phone_social', 'porn', 'smoking_vaping', 'gaming', 'junk_food', 'alcohol', 'procrastination', 'other',
] as const;
export type BadHabit = (typeof BAD_HABITS)[number];
export const REPLACE_ANSWERS = ['phone_social', 'porn', 'smoking_vaping', 'gaming', 'junk_food', 'alcohol', 'procrastination'] as const;
export type ReplaceAnswer = (typeof REPLACE_ANSWERS)[number];// every answer except 'other' has a replace habit
export const SENSITIVE_BAD_HABITS = ['porn', 'smoking_vaping', 'alcohol'] as const;// their replace names are neutral

// The six radar axes, in the Figma order (clockwise from the top)
export const AXES = ['Learning', 'Mind', 'Career', 'Discipline', 'Relations', 'Health'] as const;
export type Axis = (typeof AXES)[number];

// The first 14 are the original catalog; the last 10 arrived with the habit packs (docs/PACKS_REPORTS_SPEC.md)
export const TEMPLATE_IDS = [
  'walk20', 'stretch10', 'water_meals', 'lights_out', 'screens_off', 'breathe5', 'journal3',
  'plan_top1', 'focus25', 'study25', 'review10', 'skill15', 'message_friend', 'family_time',
  'eat_produce', 'make_bed', 'tidy5', 'set_out_essentials', 'work_win', 'reach_out', 'read15', 'teach_back',
  'thank_someone', 'kind_act',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 10;
export const CONFIDENCE_DEFAULT = 5;
export const FOCUS_MAX = 3;
export const VALUES_MAX = 2;

// In progress: null (or [] for focus and values) = not answered yet, or skipped with "Skip this question".
// focus and values keep the order they were picked in (ties use it). confidence starts at the slider's default;
// skipping Q11 makes it null (docs/ONBOARDING_SPEC.md, section 1).
export type Answers = {
  timeBudget: TimeBudget | null;
  occupation: Occupation | null;
  habitsFeel: HabitsFeel | null;
  focus: FocusArea[];
  challenge: Challenge | null;
  derails: Derail | null;
  sleep: Sleep | null;
  days: DaysPattern | null;
  values: Value[];
  badHabit: BadHabit | null;
  confidence: number | null;
};

// A finished questionnaire: every step answered or skipped. A skipped step is null ([] for focus and values) and
// contributes no signal to the plan. In memory only, never stored.
export type CompleteAnswers = {
  timeBudget: TimeBudget | null;
  occupation: Occupation | null;
  habitsFeel: HabitsFeel | null;
  focus: FocusArea[];
  challenge: Challenge | null;
  derails: Derail | null;
  sleep: Sleep | null;
  days: DaysPattern | null;
  values: Value[];
  badHabit: BadHabit | null;
  confidence: number | null;
};

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
