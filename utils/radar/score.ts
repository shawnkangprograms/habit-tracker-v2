// The live radar's scores (docs/PACKS_REPORTS_SPEC.md, section 11). Pure. Derived on every load, never stored.
//
// Per area: done / scheduled over the window's closed days (today never counts), summed over the area's habits,
// with the per-day counts from utils/dailyCompletion.ts (the perfect-day rule: deleted habits are ignored, a habit
// counts from its creation day, rest days add nothing). Week = the last 7 closed days, Month = the last 28.
// Three states per axis: a score; noData (the area has habits but none was scheduled in the window); empty (no
// habits in the area). Nothing scheduled anywhere: the radar is 'starting'.

import {dailyCompletion} from '@/utils/dailyCompletion';
import {fromDayNumber, toDayNumber, type GamiCompletion, type GamiHabit} from '@/utils/gamification';
import {AXES, type Axis} from '@/utils/onboarding/types';
import type {PacksRecord} from '@/utils/packs/record';
import {packAreas, resolveArea, type AreasMap} from '@/utils/radar/areas';

export type RadarWindowId = 'week' | 'month';
export const WINDOW_DAYS: Record<RadarWindowId, number> = {week: 7, month: 28};

export type RadarHabit = GamiHabit & {icon: string};

export type AxisResult =
  | {axis: Axis; state: 'score'; done: number; scheduled: number; share: number; percent: number}
  | {axis: Axis; state: 'noData'}
  | {axis: Axis; state: 'empty'};

export type RadarWindow = {window: RadarWindowId; axes: AxisResult[]; starting: boolean};// axes in AXES order
export type Radar = Record<RadarWindowId, RadarWindow>;

export type RadarInput = {
  habits: RadarHabit[];
  completions: GamiCompletion[];
  today: string;
  packs: PacksRecord | null;
  areas: AreasMap;
};

export function computeRadar(input: RadarInput): Radar {
  const byPack = packAreas(input.packs);
  const active = input.habits.filter((h) => !h.deleted);
  const byArea = new Map<Axis, RadarHabit[]>(AXES.map((axis) => [axis, []]));
  for (const habit of active) {
    const area = resolveArea(habit, byPack, input.areas);
    if (area) byArea.get(area)!.push(habit);
  }
  // one pass of per-day counts per area, shared by both windows
  const closed = new Map(AXES.map((axis) => {
    const habits = byArea.get(axis)!;
    return [axis, habits.length ? dailyCompletion(habits, input.completions, input.today).closed : []] as const;
  }));
  const todayN = toDayNumber(input.today);

  const build = (window: RadarWindowId): RadarWindow => {
    const from = fromDayNumber(todayN - WINDOW_DAYS[window]);// the oldest closed day in the window
    const axes = AXES.map((axis): AxisResult => {
      if (byArea.get(axis)!.length === 0) return {axis, state: 'empty'};
      let done = 0;
      let scheduled = 0;
      for (const day of closed.get(axis)!) {
        if (day.date < from) continue;
        done += day.done;
        scheduled += day.scheduled;
      }
      if (scheduled === 0) return {axis, state: 'noData'};
      const share = done / scheduled;
      return {axis, state: 'score', done, scheduled, share, percent: Math.round(share * 100)};
    });
    return {window, axes, starting: axes.every((a) => a.state !== 'score')};
  };
  return {week: build('week'), month: build('month')};
}

// ---------- Strongest and "needs care" ----------
// Strongest: the highest scored axis. Needs care: the lowest scored axis, only when it is below 75% and is not
// the strongest (so never with a single scored axis, or when every score is equal). Ties: the first in AXES order.

export const NEEDS_CARE_BELOW = 0.75;

type Scored = Extract<AxisResult, {state: 'score'}>;

export function highlights(window: RadarWindow): {strongest: Scored | null; needsCare: Scored | null} {
  const scored = window.axes.filter((a): a is Scored => a.state === 'score');
  if (scored.length === 0) return {strongest: null, needsCare: null};
  let strongest = scored[0];
  let lowest = scored[0];
  for (const a of scored) {
    if (a.share > strongest.share) strongest = a;
    if (a.share < lowest.share) lowest = a;
  }
  const needsCare = lowest.axis !== strongest.axis && lowest.share < NEEDS_CARE_BELOW ? lowest : null;
  return {strongest, needsCare};
}

// The live shape's points, in AXES order (0..1); axes without a score sit at the centre
export function radarShape(window: RadarWindow): number[] {
  return window.axes.map((a) => (a.state === 'score' ? a.share : 0));
}
