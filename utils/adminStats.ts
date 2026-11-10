// The admin Stats screen's data, from the stats/{YYYY-MM-DD} documents that computeDailyStats and refreshStats
// write (functions/src/stats/aggregate.js). Pure: no React, Firebase or clock (callers pass `nowMs`).
//
// Rules:
// - A day with no document, or with a value it couldn't measure, is a GAP (null), never a zero. Lines break at
//   gaps and bars are left out.
// - The "Include test accounts" switch picks the document's `all` section; off picks `real`.
// - Snapshot cards (sign-ups per week, habits by area, habit setup) use the NEWEST document in the range.
// - Percentages are whole numbers. Shares of one whole use the largest-remainder method, so they add up to 100.

export type RangeDays = 7 | 30 | 90;
export const RANGES: readonly RangeDays[] = [7, 30, 90];
export const DEFAULT_RANGE: RangeDays = 30;
export const MAX_RANGE: RangeDays = 90;

export const AREA_KEYS = ['Learning', 'Mind', 'Career', 'Discipline', 'Relations', 'Health', 'none'] as const;
export type AreaKey = (typeof AREA_KEYS)[number];
export const AREA_LABELS: Record<AreaKey, string> = {
  Learning: 'Learning', Mind: 'Mind', Career: 'Career', Discipline: 'Discipline', Relations: 'Relations', Health: 'Health',
  none: 'Not counted',
};

// One section of a stats document, as stored. Every field may be missing or malformed: it is read defensively.
export type StatsSection = {
  accounts?: unknown;
  activeUsers?: {openedDay?: unknown; openedWeek?: unknown; loggedDay?: unknown; loggedWeek?: unknown};
  signups?: {day?: unknown; perWeek?: unknown};
  completion?: {scheduled?: unknown; done?: unknown};
  habits?: {
    total?: unknown;
    byArea?: Record<string, unknown>;
    source?: Record<string, unknown>;
    frequency?: Record<string, unknown>;
    withReminder?: unknown;
  };
  aiInsights?: {modelCalls?: unknown};
};

export type StatsDoc = {day: string; all?: StatsSection; real?: StatsSection; computedAtMs: number | null};

export type Split = {left: {label: string; count: number; percent: number}; right: {label: string; count: number; percent: number}};

export type Slice = {key: AreaKey; label: string; count: number; percent: number};

export type StatsView = {
  dates: string[];// the range, oldest first, ending today
  opened: (number | null)[];
  logged: (number | null)[];
  latestActive: {day: string; opened: number | null; logged: number | null} | null;
  signupWeeks: {weekStart: string; count: number}[];// from the newest doc (13 weeks), [] if none
  completionPercent: (number | null)[];// null: no doc, or nothing scheduled that day
  areas: Slice[];// all seven, Not counted last; [] if no doc
  areaTotal: number;
  setup: {frequency: Split; reminders: Split; source: Split} | null;
  aiCalls: (number | null)[];
  updatedAtMs: number | null;// newest computedAt in the range
  hasAnyDoc: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;// stats days are Nairobi dates (Kenya is UTC+3 all year)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- dates ----------

// Today's Nairobi date, the key of today's stats document. Deliberately NOT the phone's local date: the documents
// are keyed by Nairobi day on the server (same arithmetic as nairobiDay in functions/src/dailyLimit.js).
export function nairobiToday(nowMs: number): string {
  return new Date(nowMs + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);// a UTC day number, so the UTC date is the right one
}

// `days` dates ending with `today`, oldest first
export function rangeDates(today: string, days: number): string[] {
  const end = dayNumber(today);
  return Array.from({length: days}, (_, i) => fromDayNumber(end - days + 1 + i));
}

// "9 Nov"
export function shortDate(date: string): string {
  if (!DATE_RE.test(date)) return date;
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// "Mon 9 Nov"
export function dayLabel(date: string): string {
  if (!DATE_RE.test(date)) return date;
  return `${WEEKDAYS[new Date(dayNumber(date) * DAY_MS).getUTCDay()]} ${shortDate(date)}`;
}

// "Today", "Yesterday" or "Mon 9 Nov"
export function relativeDayLabel(date: string, today: string): string {
  const diff = dayNumber(today) - dayNumber(date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dayLabel(date);
}

// "14:05" in the phone's own time
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- numbers ----------

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

// Whole-number shares of one total that always add up to 100 (largest remainder; ties go to the earlier item).
// All zeros (or an empty list) give all zeros.
export function sharePercents(counts: number[]): number[] {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, f) => sum + f, 0);
  const order = exact.map((e, i) => ({i, rest: e - Math.floor(e)})).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const {i} of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

// done / scheduled as a whole percent; null when nothing was scheduled (not a 0% day)
export function completionPercent(scheduled: unknown, done: unknown): number | null {
  const s = count(scheduled);
  const d = count(done);
  if (s === null || d === null || s === 0) return null;
  return Math.round((Math.min(d, s) / s) * 100);
}

// A "nice" axis maximum at or above `max`: 1, 2, 5 or 10 times a power of ten, at least 2 (so the half-way grid
// label is a whole number)
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 2) return 2;
  if (max <= 10) return Math.ceil(max / 2) * 2;// below 10: the next even number (5 would put 2.5 half-way)
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((s) => s * power >= max) ?? 10;
  return step * power;
}

function split(leftLabel: string, leftCount: number, rightLabel: string, rightCount: number): Split {
  const [lp, rp] = sharePercents([leftCount, rightCount]);
  return {left: {label: leftLabel, count: leftCount, percent: lp}, right: {label: rightLabel, count: rightCount, percent: rp}};
}

// ---------- the view ----------

export function pickSection(doc: StatsDoc, includeTest: boolean): StatsSection | null {
  const section = includeTest ? doc.all : doc.real;
  return section && typeof section === 'object' ? section : null;
}

export function buildStatsView(
  docs: readonly StatsDoc[],
  options: {days: RangeDays; includeTest: boolean; nowMs: number},
): StatsView {
  const dates = rangeDates(nairobiToday(options.nowMs), options.days);
  const byDay = new Map<string, StatsSection>();
  let updatedAtMs: number | null = null;
  for (const doc of docs) {
    if (!dates.includes(doc.day)) continue;
    const section = pickSection(doc, options.includeTest);
    if (!section) continue;
    byDay.set(doc.day, section);
    if (typeof doc.computedAtMs === 'number' && (updatedAtMs === null || doc.computedAtMs > updatedAtMs)) {
      updatedAtMs = doc.computedAtMs;
    }
  }

  const series = (read: (s: StatsSection) => number | null) => dates.map((d) => {
    const s = byDay.get(d);
    return s ? read(s) : null;
  });

  const opened = series((s) => count(s.activeUsers?.openedDay));
  const logged = series((s) => count(s.activeUsers?.loggedDay));

  // newest day in the range with a document
  const newestDay = [...dates].reverse().find((d) => byDay.has(d)) ?? null;
  const newest = newestDay ? byDay.get(newestDay)! : null;

  const latestActive = newestDay && newest
    ? {day: newestDay, opened: count(newest.activeUsers?.openedDay), logged: count(newest.activeUsers?.loggedDay)}
    : null;

  const rawWeeks: unknown = newest?.signups?.perWeek;
  const signupWeeks: {weekStart: string; count: number}[] = [];
  for (const w of Array.isArray(rawWeeks) ? rawWeeks : []) {
    const weekStart = (w as {weekStart?: unknown} | null)?.weekStart;
    const n = count((w as {count?: unknown} | null)?.count);
    if (typeof weekStart === 'string' && DATE_RE.test(weekStart) && n !== null) signupWeeks.push({weekStart, count: n});
  }

  const areaCounts = AREA_KEYS.map((k) => count(newest?.habits?.byArea?.[k]) ?? 0);
  const areaTotal = areaCounts.reduce((sum, c) => sum + c, 0);
  const areaPercents = sharePercents(areaCounts);
  const areas: Slice[] = newest
    ? AREA_KEYS.map((key, i) => ({key, label: AREA_LABELS[key], count: areaCounts[i], percent: areaPercents[i]}))
    : [];

  let setup: StatsView['setup'] = null;
  const h = newest?.habits;
  if (h) {
    const total = count(h.total) ?? 0;
    const withReminder = Math.min(count(h.withReminder) ?? 0, total);
    setup = {
      frequency: split('Every day', count(h.frequency?.daily) ?? 0, 'Some weekdays', count(h.frequency?.weekdays) ?? 0),
      reminders: split('With reminder', withReminder, 'No reminder', total - withReminder),
      source: split('Added by user', count(h.source?.user) ?? 0, 'Suggested', count(h.source?.ai_suggested) ?? 0),
    };
  }

  return {
    dates,
    opened,
    logged,
    latestActive,
    signupWeeks,
    completionPercent: series((s) => completionPercent(s.completion?.scheduled, s.completion?.done)),
    areas,
    areaTotal,
    setup,
    aiCalls: series((s) => count(s.aiInsights?.modelCalls)),
    updatedAtMs,
    hasAnyDoc: byDay.size > 0,
  };
}

// ---------- words ----------

export function hasValues(values: readonly (number | null)[]): boolean {
  return values.some((v) => v !== null);
}

// "from 2 to 14", "14 on every day", or "no data"
export function rangeWords(values: readonly (number | null)[], unit = ''): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return 'no data';
  const min = Math.min(...known);
  const max = Math.max(...known);
  return min === max ? `${max}${unit} on every day with data` : `from ${min}${unit} to ${max}${unit}`;
}

// One label per chart for screen readers
export function activeUsersLabel(view: StatsView, days: number): string {
  return `Active users, last ${days} days: opened the app ${rangeWords(view.opened)}; logged a habit ${rangeWords(view.logged)}.`;
}

export function signupsLabel(view: StatsView): string {
  const total = view.signupWeeks.reduce((sum, w) => sum + w.count, 0);
  return `Sign-ups per week, last ${view.signupWeeks.length} weeks: ${total} in total, ${rangeWords(view.signupWeeks.map((w) => w.count))} a week.`;
}

export function completionLabel(view: StatsView, days: number): string {
  return `Completion rate, last ${days} days, rebuilt from schedules: ${rangeWords(view.completionPercent, '%')}.`;
}

export function areasLabel(view: StatsView): string {
  const parts = view.areas.filter((s) => s.count > 0).map((s) => `${s.label} ${s.count} (${s.percent}%)`);
  return `Habits by area, by habit icon, ${view.areaTotal} habits: ${parts.length > 0 ? parts.join(', ') : 'none'}.`;
}

export function aiLabel(view: StatsView, days: number): string {
  const total = view.aiCalls.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return `AI insights per day, last ${days} days: ${total} in total, ${rangeWords(view.aiCalls)} a day.`;
}

export function splitLabel(title: string, s: Split): string {
  return `${title}: ${s.left.label} ${s.left.count} (${s.left.percent}%), ${s.right.label} ${s.right.count} (${s.right.percent}%).`;
}

// ---------- refresh ----------

export type RefreshOutcome = 'ok' | 'refused' | 'error';

// A refreshStats failure: the once-a-minute refusal, or anything else (offline, timeout, server error)
export function refreshOutcomeOf(err: unknown): Exclude<RefreshOutcome, 'ok'> {
  const code = (err as {code?: unknown} | null)?.code;
  return code === 'functions/resource-exhausted' || code === 'resource-exhausted' ? 'refused' : 'error';
}

export const REFRESH_MESSAGES: Record<Exclude<RefreshOutcome, 'ok'>, string> = {
  refused: 'Try again in a minute',
  error: "Couldn't refresh. Showing the last saved numbers.",
};
