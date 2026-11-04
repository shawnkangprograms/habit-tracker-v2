// Onboarding motion: every duration, delay and offset, plus the small rules the components share
// (docs/ONBOARDING_SPEC.md section 6, and the approved stage 4 plan). Pure numbers and functions: no Reanimated
// import, so the easings live in the components. Everything animates transforms and opacity only, runs once and
// stops, and is skipped entirely under reduced motion (shouldAnimate).

// ---------- Questions ----------

export const STEP_ENTER_MS = 200;// the new step slides in and fades in; enter only, no exit
export const STEP_OFFSET_PX = 16;
export const PROGRESS_MS = 250;// progress fill and its head dot
export const OPTION_PRESS_IN_MS = 90;// answer rows press down like a button
export const OPTION_PRESS_OUT_MS = 140;
export const OPTION_PRESS_DEPTH_PX = 3;
export const SELECT_FADE_MS = 150;// the selected outline and tint
export const MARK_POP_MS = 180;// radio dot / checkbox tick
export const THUMB_HOLD_MS = 120;
export const THUMB_HOLD_SCALE = 1.15;
export const THUMB_GLIDE_MS = 90;// the slider thumb between steps
export const NUMBER_BUMP_UP_MS = 80;
export const NUMBER_BUMP_DOWN_MS = 120;
export const NUMBER_BUMP_SCALE = 1.12;
export const BUTTON_PRESS_IN_MS = 90;// Continue, Start, Done, Add your own habit
export const BUTTON_PRESS_OUT_MS = 140;
export const BUTTON_PRESS_SCALE = 0.97;

// ---------- Building Profile ----------

export const BUILDING_DURATION_MS = 2500;// the count to 100% (never stretched: see building-profile.tsx)
export const BUILDING_TICK_MS = 100;// the counter's step, and the ring's animation per step
export const BUILDING_HOLD_MS = 300;// at 100%, so READY can be seen; the settle runs inside it
export const BUILDING_REDUCED_HOLD_MS = 800;
export const QUOTE_MS = 1200;// one swap mid-count (at 1.2 s, finished by 1.65 s)
export const ROW_TICK_HALF_MS = 110;
export const QUOTE_IN_MS = 250;
export const QUOTE_OUT_MS = 200;

// A quote swap may start only while the count runs and only if its fade out and in end before the count does,
// so no new quote appears as the screen moves on. Once it says no, rotation stops for good.
export function canStartQuoteSwap(elapsedMs: number, complete: boolean): boolean {
  return !complete && elapsedMs + QUOTE_OUT_MS + QUOTE_IN_MS <= BUILDING_DURATION_MS;
}
export const READY_SETTLE_HALF_MS = 130;
export const READY_SCALE = 1.04;

// ---------- Habit Profile radar ----------

export const RADAR_BASELINE_MS = 200;
export const RADAR_DATA_DELAY_MS = 150;
export const RADAR_DATA_MS = 350;
export const RADAR_DATA_FROM_SCALE = 0.2;
export const RADAR_LABELS_DELAY_MS = 450;
export const RADAR_LABELS_MS = 200;

// ---------- Lists (What you told us, Recommended Routine) ----------

export const ITEM_ENTER_MS = 220;
export const ITEM_OFFSET_PX = 12;
export const TOLD_US_STAGGER_MS = 60;
export const ROUTINE_STAGGER_MS = 70;
export const STAGGER_CAP_MS = 360;// the last item of any list starts by then
export const CHECK_POP_HALF_MS = 90;
export const ADDED_OUT_MS = 120;
export const ADDED_IN_MS = 160;

export type Direction = 'forward' | 'back';

// Which way the questions moved; null when they didn't (or on first mount), so nothing animates then
export function stepDirection(previous: number | null, next: number): Direction | null {
  if (previous === null || previous === next) return null;
  return next > previous ? 'forward' : 'back';
}

// Forward steps come in from the right, Back from the left
export function enterOffsetX(direction: Direction): number {
  return direction === 'forward' ? STEP_OFFSET_PX : -STEP_OFFSET_PX;
}

// Item `index` starts this long after the first, never later than `cap`
export function staggerDelay(index: number, step: number, cap: number = STAGGER_CAP_MS): number {
  return Math.min(cap, Math.max(0, index) * step);
}

// One rule for every component: no motion at all under the system reduce-motion setting
export function shouldAnimate(reduceMotion: boolean): boolean {
  return !reduceMotion;
}
