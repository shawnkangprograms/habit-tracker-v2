// What the result screens show for a plan, with skipped questions (docs/ONBOARDING_SPEC.md, section 5). Pure.
//
// A skipped question contributes nothing: "What you told us" has a card only for each answered card question (Q5,
// Q8, Q6), and its "Your first moves" only when there is an area signal. A balanced plan (no scoring question
// answered) skips the screen, shows BALANCED_LINE instead of a focus on the Habit Profile, creates no packs and saves
// no starting outline.

import {
  BALANCED_LINE, CHALLENGE_CARD_LABEL, CHALLENGE_LINES, DERAILS_CARD_LABEL, DERAIL_LINES, FOCUS_CARDS, RHYTHM_CARD_LABEL,
  RHYTHM_LINES, focusTitle,
} from '@/utils/onboarding/copy';
import type {Plan} from '@/utils/onboarding/plan';
import type {CompleteAnswers} from '@/utils/onboarding/types';

export type ToldUsCard = {label: string; line: string};

// The cards for the answered questions only, in the screen's order: challenge, rhythm, what derails
export function toldUsCards(answers: Pick<CompleteAnswers, 'challenge' | 'days' | 'derails'>): ToldUsCard[] {
  const cards: ToldUsCard[] = [];
  if (answers.challenge !== null) cards.push({label: CHALLENGE_CARD_LABEL, line: CHALLENGE_LINES[answers.challenge]});
  if (answers.days !== null) cards.push({label: RHYTHM_CARD_LABEL, line: RHYTHM_LINES[answers.days]});
  if (answers.derails !== null) cards.push({label: DERAILS_CARD_LABEL, line: DERAIL_LINES[answers.derails]});
  return cards;
}

// "What you told us" shows when it has something: cards, or the first moves (which need an area signal)
export function showsToldUs(plan: Pick<Plan, 'balanced' | 'answers'>): boolean {
  return !plan.balanced || toldUsCards(plan.answers).length > 0;
}

// The Habit Profile's card: the focus, or the balanced line
export function profileCard(plan: Pick<Plan, 'balanced' | 'focus'>): {title: string; subtitle: string | null} {
  return plan.balanced
    ? {title: BALANCED_LINE, subtitle: null}
    : {title: focusTitle(plan.focus), subtitle: FOCUS_CARDS[plan.focus].subtitle};
}

// The starting outline (profile:outline:v1) is saved only when a scoring question was answered
export function savesOutline(plan: Pick<Plan, 'balanced'>): boolean {
  return !plan.balanced;
}

// A balanced run creates no packs (Home's "Choose your habit packs" card offers them); starters still join packs the
// user already has
export function createsPacks(plan: Pick<Plan, 'balanced'>): boolean {
  return !plan.balanced;
}
