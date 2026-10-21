// "Earlier than usual": compares the time of today's tick with the habit's typical tick time.
// Pure: no database or React. Times are LOCAL minutes of the day (0..1439), never derived from toISOString.
//
// A sample is a completed row that was ticked on its own day (updatedAt's local date equals the row's date).
// That excludes backfilled/system rows (updatedAt 0) and rows changed on a later day. No midnight wrap:
// a habit usually done around midnight compares 23:50 and 00:10 as far apart. Accepted.

import {getLocalDateString} from '@/utils/dates';

export const MAX_SAMPLES = 14;// the newest 14 same-day ticks
export const MIN_SAMPLES = 5;// fewer than this: no typical time yet
export const EARLY_BY_MINUTES = 60;

export type CompletionTimeRow = {date: string; updatedAt: number};

export function localMinutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

// Minutes of the day for the newest `limit` same-day ticks, newest first
export function sameDaySamples(rows: CompletionTimeRow[], limit: number = MAX_SAMPLES): number[] {
  return rows
    .filter((r) => typeof r.updatedAt === 'number' && r.updatedAt > 0 && getLocalDateString(new Date(r.updatedAt)) === r.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((r) => localMinutesOfDay(r.updatedAt));
}

// Median minute of the day, or null with fewer than MIN_SAMPLES (an even count averages the middle two)
export function typicalMinutes(samples: number[]): number | null {
  if (samples.length < MIN_SAMPLES) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// True when this tick is at least EARLY_BY_MINUTES before the typical time
export function isEarlierThanUsual(nowMs: number, samples: number[]): boolean {
  const typical = typicalMinutes(samples);
  return typical !== null && typical - localMinutesOfDay(nowMs) >= EARLY_BY_MINUTES;
}
