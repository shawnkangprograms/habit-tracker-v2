// Strict check of the generateInsight request. Pure: no Firebase, runs under Node's test runner.
// The request carries only enums and bounded integers; no free text from the user ever reaches the prompt.
// Anything unexpected (extra key, wrong type, float, out of range) is rejected, never coerced.
//
// {v: 1, trackedDays: 3..30, streak: 0..3650, bestWeekday: 'mon'..'sun' | null,
//  habits: 1..10 x {icon: ICON_LABELS key, freq: 'daily' | 'weekdays', daysPerWeek: 1..7 (7 when daily),
//                   done: 0..30, scheduled: 1..30, done <= scheduled}}

import {
  ICON_LABELS, MAX_HABITS, MAX_INPUT_CHARS, MAX_STREAK, MAX_TRACKED_DAYS, MIN_TRACKED_DAYS, WEEKDAYS,
} from './config.js';

const TOP_KEYS = ['v', 'trackedDays', 'streak', 'bestWeekday', 'habits'];
const HABIT_KEYS = ['icon', 'freq', 'daysPerWeek', 'done', 'scheduled'];

// A plain JSON object (not an array, null, or a class instance) with exactly these keys
function hasExactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}

function isIntIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @typedef {{icon: string, freq: 'daily' | 'weekdays', daysPerWeek: number, done: number, scheduled: number}} InsightHabit
 * @typedef {{v: 1, trackedDays: number, streak: number, bestWeekday: string | null, habits: InsightHabit[]}} InsightInput
 * @typedef {{ok: true, value: InsightInput} | {ok: false, reason: string}} InputResult
 */

/** @returns {InputResult} */
function fail(reason) {
  return {ok: false, reason};
}

function checkHabit(h) {
  if (!hasExactKeys(h, HABIT_KEYS)) return 'habit_keys';
  if (typeof h.icon !== 'string' || !Object.hasOwn(ICON_LABELS, h.icon)) return 'habit_icon';
  if (h.freq !== 'daily' && h.freq !== 'weekdays') return 'habit_freq';
  if (!isIntIn(h.daysPerWeek, 1, 7)) return 'habit_daysPerWeek';
  if (h.freq === 'daily' && h.daysPerWeek !== 7) return 'habit_daysPerWeek';
  if (!isIntIn(h.scheduled, 1, MAX_TRACKED_DAYS)) return 'habit_scheduled';
  if (!isIntIn(h.done, 0, h.scheduled)) return 'habit_done';
  return null;
}

// {ok: true, value} with a fresh copy holding only the known fields, or {ok: false, reason}.
// The reason is a short code, safe to log (it never contains input values).
/** @returns {InputResult} */
export function validateInput(data) {
  let size;
  try {
    size = JSON.stringify(data)?.length ?? 0;// undefined has no JSON form; the key check rejects it
  } catch {
    return fail('not_json');
  }
  if (size > MAX_INPUT_CHARS) return fail('too_large');
  if (!hasExactKeys(data, TOP_KEYS)) return fail('keys');
  if (data.v !== 1) return fail('version');
  if (!isIntIn(data.trackedDays, MIN_TRACKED_DAYS, MAX_TRACKED_DAYS)) return fail('trackedDays');
  if (!isIntIn(data.streak, 0, MAX_STREAK)) return fail('streak');
  if (data.bestWeekday !== null && !WEEKDAYS.includes(data.bestWeekday)) return fail('bestWeekday');
  if (!Array.isArray(data.habits) || data.habits.length < 1 || data.habits.length > MAX_HABITS) return fail('habits');
  for (const h of data.habits) {
    const reason = checkHabit(h);
    if (reason) return fail(reason);
  }
  return {
    ok: true,
    value: {
      v: 1,
      trackedDays: data.trackedDays,
      streak: data.streak,
      bestWeekday: data.bestWeekday,
      habits: data.habits.map((h) => ({
        icon: h.icon, freq: h.freq, daysPerWeek: h.daysPerWeek, done: h.done, scheduled: h.scheduled,
      })),
    },
  };
}
