// Radar strings (docs/PACKS_REPORTS_SPEC.md, section 11; approved in the Stage 5 plan). Pure.

import type {Axis} from '@/utils/onboarding/types';
import type {AxisResult, RadarWindowId} from '@/utils/radar/score';

export const RADAR_TITLE = 'Habit radar';
export const RADAR_STARTING = 'Starts after your first full day.';
export const RADAR_CARD_HINT = 'Opens Summary';
export const NO_DATA = 'No data';
export const NO_HABITS_HERE = 'No habits here yet';
export const WINDOW_CAPTION: Record<RadarWindowId, string> = {week: 'Last 7 days', month: 'Last 28 days'};
export const WINDOW_LABEL: Record<RadarWindowId, string> = {week: 'Week', month: 'Month'};

// The habit form's AREA row
export const AREA_ROW_LABEL = 'AREA';
export const AREA_NOT_COUNTED = 'Not counted';
export const AREA_ROW_HELPER = "Used for your radar. Habits in a pack use the pack's area.";

// Axis labels on the Summary radar: two lines, the area name, then "{n}%" or "–" when there is no score
export function axisLabelLines(a: AxisResult): {first: string; second: string} {
  return {first: a.axis, second: a.state === 'score' ? `${a.percent}%` : '–'};
}

// The value column of the six-row list under the radar
export function axisValue(a: AxisResult): string {
  return a.state === 'score' ? `${a.percent}%` : a.state === 'noData' ? NO_DATA : NO_HABITS_HERE;
}

export function axisDetail(a: AxisResult): string | null {
  return a.state === 'score' ? `${a.done} of ${a.scheduled}` : null;
}

export function strongestText(axis: Axis, percent: number): string {
  return `Strongest: ${axis} ${percent}%`;
}

export function needsCareText(axis: Axis, percent: number): string {
  return `Needs care: ${axis} ${percent}%`;
}

// What a screen reader hears: every axis in words, never colour
export function radarA11yLabel(window: RadarWindowId, axes: AxisResult[], starting: boolean): string {
  const lead = `${RADAR_TITLE}, ${WINDOW_CAPTION[window].toLowerCase()}: `;
  if (starting) return `${lead}${RADAR_STARTING}`;
  const parts = axes.map((a) => (a.state === 'score' ? `${a.axis} ${a.percent} percent`
    : `${a.axis} ${a.state === 'noData' ? 'no data' : 'no habits yet'}`));
  return `${lead}${parts.join(', ')}.`;
}
