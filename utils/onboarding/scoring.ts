// The Habit Profile scores (docs/ONBOARDING_SPEC.md, section 3). Pure.
// Six axes, each starting at 1, capped at 5. The radar plots score / 5 against a fixed 2 / 5 baseline.

import {
  AXES, STUDENT_ONLY_CHALLENGES, type Axis, type CompleteAnswers, type FocusArea,
} from '@/utils/onboarding/types';

export type Scores = Record<Axis, number>;
// Q1 (timeBudget) and Q10 never score: the time budget only caps the starter picks
export type ScoringInput = Pick<
  CompleteAnswers,'occupation' | 'habitsFeel' | 'focus' | 'challenge' | 'derails' | 'sleep' | 'days' | 'values'
>;

export const AXIS_MIN = 1;
export const AXIS_MAX = 5;
export const RADAR_BASELINE = 2;

export const FOCUS_AREA_AXIS: Record<FocusArea, Axis> = {
  health: 'Health',
  mental: 'Mind',
  career: 'Career',
  discipline: 'Discipline',
  relationships: 'Relations',
  education: 'Learning',
};

// Last tie-break, after the order the user picked their Q4 focus areas in
export const TIE_ORDER: readonly Axis[] = ['Discipline', 'Health', 'Mind', 'Career', 'Learning', 'Relations'];

export function scoreAxes(a: ScoringInput): Scores {
  const focus = (area: FocusArea) => (a.focus.includes(area) ? 2 : 0);
  const point = (condition: boolean) => (condition ? 1 : 0);
  const raw: Scores = {
    Health: focus('health') + point(a.values.includes('health_energy'))
      + point(a.sleep === 'struggle' || a.sleep === 'irregular') + point(a.challenge === 'low_energy'),
    Mind: focus('mental') + point(a.values.includes('peace_of_mind'))
      + point(a.habitsFeel === 'overwhelmed') + point(a.derails === 'stress'),
    Discipline: focus('discipline') + point(a.challenge === 'procrastination') + point(a.derails === 'low_motivation')
      + point(a.habitsFeel === 'struggling' || a.habitsFeel === 'overwhelmed') + point(a.days === 'chaotic'),
    Career: focus('career') + point(a.values.includes('achievement'))
      + point(a.occupation !== 'student') + point(a.challenge === 'time' || a.challenge === 'balance'),
    Learning: focus('education') + point(a.occupation === 'student')
      + point((STUDENT_ONLY_CHALLENGES as readonly string[]).includes(a.challenge)),
    Relations: focus('relationships') + point(a.values.includes('connection')) + point(a.derails === 'social_pressure'),
  };
  const scores = {} as Scores;
  for (const axis of AXES) scores[axis] = Math.min(AXIS_MAX, AXIS_MIN + raw[axis]);
  return scores;
}

// Every axis, highest score first. Ties: the order the user picked their focus areas in Q4, then TIE_ORDER.
export function rankAxes(scores: Scores, focus: readonly FocusArea[]): Axis[] {
  const picked = focus.map((area) => FOCUS_AREA_AXIS[area]);
  const tieRank = (axis: Axis) => {
    const i = picked.indexOf(axis);
    return i === -1 ? picked.length + TIE_ORDER.indexOf(axis) : i;
  };
  return [...AXES].sort((x, y) => scores[y] - scores[x] || tieRank(x) - tieRank(y));
}

export function focusAxis(scores: Scores, focus: readonly FocusArea[]): Axis {
  return rankAxes(scores, focus)[0];
}

// The radar's points, in AXES order, as a share of the maximum (0.2..1)
export function radarValues(scores: Scores): number[] {
  return AXES.map((axis) => scores[axis] / AXIS_MAX);
}
