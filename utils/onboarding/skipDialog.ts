// The "Skip setup" confirmation (docs/ONBOARDING_SPEC.md, section 10). Pure.
//
// closed -> confirm (tap "Skip setup"; ignored while habits are being created)
// confirm -> closed ("No", or hardware Back: the same step, answers kept)
// confirm -> leaving ("Yes": the skip record is written now, see app/onboarding.tsx)
// leaving -> done ("Go home", Back, or LEAVING_AUTO_MS passing; whichever comes first, once)
// done is final: the flow closes exactly once.

import {
  BACK_TO_SETTINGS, GO_HOME, LEAVE_BODY, LEAVE_NO, LEAVE_TITLE, LEAVE_YES, LEAVING_NOTICE, RETAKE_LEAVING_NOTICE, SKIP_BODY,
  SKIP_NO, SKIP_TITLE, SKIP_YES,
} from '@/utils/onboarding/copy';
import type {OnboardingEntry} from '@/utils/onboarding/gate';

export type SkipDialogState = 'closed' | 'confirm' | 'leaving' | 'done';
export type SkipDialogEvent = 'open' | 'no' | 'back' | 'yes' | 'goHome' | 'timeout';

export const LEAVING_AUTO_MS = 2000;

export function skipDialogNext(state: SkipDialogState, event: SkipDialogEvent, busy: boolean): SkipDialogState {
  switch (state) {
    case 'closed':
      return event === 'open' && !busy ? 'confirm' : state;
    case 'confirm':
      if (event === 'no' || event === 'back') return 'closed';
      return event === 'yes' ? 'leaving' : state;
    case 'leaving':
      return event === 'goHome' || event === 'timeout' || event === 'back' ? 'done' : state;
    case 'done':
      return state;
  }
}

export type SkipCopy = {title: string; body: string; yes: string; no: string; notice: string; goHome: string};

// Once this run has created a habit (a card or the user's own), the dialog says "Leave" and that they are saved.
// The notice and its button say where the flow goes: the first run returns to Home, a retake started from Settings
// returns to Settings (app/onboarding.tsx closeFlow goes back to whichever opened it).
export function skipCopy(createdAny: boolean, entry: OnboardingEntry = 'auto'): SkipCopy {
  const words = createdAny
    ? {title: LEAVE_TITLE, body: LEAVE_BODY, yes: LEAVE_YES, no: LEAVE_NO}
    : {title: SKIP_TITLE, body: SKIP_BODY, yes: SKIP_YES, no: SKIP_NO};
  return entry === 'settings'
    ? {...words, notice: RETAKE_LEAVING_NOTICE, goHome: BACK_TO_SETTINGS}
    : {...words, notice: LEAVING_NOTICE, goHome: GO_HOME};
}
