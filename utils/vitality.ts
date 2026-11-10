// Vitality (docs/PACKS_REPORTS_SPEC.md, section 13): a 0 to 100 bar derived from history on every stats load, never
// stored. Pure. The per-day counts come from utils/dailyCompletion.ts (the perfect-day rule).
//
// It starts at 50 and each CLOSED day with at least one scheduled habit adds round(10 x share done) - 4 (+6 for a
// full day, +1 for half, 0 at 40%, -4 for none), clamped to 0..100 after every day. Days with nothing scheduled
// change nothing; a day the app wasn't opened has no ticks, so it counts as 0 done. Before any such day has closed
// it is 'starting'. Today is never part of the history: the shown value adds today's provisional delta only when
// it is a gain, so a loss appears when the day closes (at midnight Home reloads its stats).

import type {DayCount} from '@/utils/dailyCompletion';
import {isDateString, type GamiCompletion} from '@/utils/gamification';

export const VITALITY_START = 50;
export const VITALITY_MAX = 100;
export const VITALITY_LOW = 25;// under this: Low
export const VITALITY_HIGH = 75;// this and over: Strong

export type VitalityBand = 'low' | 'steady' | 'strong';
export type Vitality =
  | {state: 'starting'; restarts: boolean}// restarts: the account has completion history (V-2)
  | {state: 'ready'; value: number; closedValue: number; band: VitalityBand};// value: what is shown

// round(10 x done / scheduled) - 4, with halves rounding up (Math.round), in whole numbers so 2.5 and 7.5 can't
// slip on floating point. 0 for a day with nothing scheduled.
export function dayDelta(done: number, scheduled: number): number {
  if (scheduled <= 0) return 0;
  const d = Math.min(Math.max(0, done), scheduled);
  return Math.floor((20 * d + scheduled) / (2 * scheduled)) - 4;
}

const clamp = (v: number) => Math.min(VITALITY_MAX, Math.max(0, v));

export function vitalityBand(value: number): VitalityBand {
  return value < VITALITY_LOW ? 'low' : value < VITALITY_HIGH ? 'steady' : 'strong';
}

// V-2 (section 17): any completed row dated before today, whatever its habit (deleted habits included). Un-ticked
// rows, today's rows and rows dated after today are not history. Over the rows the stats load already has.
export function hasCompletionHistory(completions: GamiCompletion[], today: string): boolean {
  return completions.some((c) => c.completed === true && isDateString(c.date) && c.date < today);
}

// hadHistory: hasCompletionHistory over the same rows; it only chooses the starting copy, never the value
export function computeVitality(days: {closed: DayCount[]; today: DayCount | null}, hadHistory = false): Vitality {
  let value: number | null = null;
  for (const day of days.closed) {
    if (day.scheduled <= 0) continue;
    value = clamp((value ?? VITALITY_START) + dayDelta(day.done, day.scheduled));
  }
  if (value === null) return {state: 'starting', restarts: hadHistory};
  const provisional = days.today ? dayDelta(days.today.done, days.today.scheduled) : 0;
  const shown = clamp(value + Math.max(0, provisional));
  return {state: 'ready', value: shown, closedValue: value, band: vitalityBand(shown)};
}

// ---------- Strings (approved for Stage 4) ----------

export const VITALITY_LABEL = 'Vitality';
export const VITALITY_STARTING = 'Starts after your first full day.';
export const VITALITY_RESTARTING = 'Restarts after your first full day.';// V-2: starting with completion history

export function vitalityStartingText(restarts: boolean): string {
  return restarts ? VITALITY_RESTARTING : VITALITY_STARTING;
}

// The starting line is one element for screen readers, reading the same text that is shown
export function vitalityStartingA11yLabel(restarts: boolean): string {
  return `${VITALITY_LABEL}. ${vitalityStartingText(restarts)}`;
}
export const VITALITY_BAND_TEXT: Record<VitalityBand, string> = {
  low: 'Low. Today is a fresh start.',
  steady: 'Steady. Keep the days ticking.',
  strong: "Strong. You're on a roll.",
};

export function vitalityValueText(value: number): string {
  return `${value} / ${VITALITY_MAX}`;
}

export function vitalityA11yLabel(value: number): string {
  return `Vitality ${value} out of ${VITALITY_MAX}`;
}
