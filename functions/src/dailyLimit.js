// Rate-limit decisions for generateInsight. Pure: the function reads the documents in a Firestore transaction,
// passes them here, and writes back exactly what this returns. Only the function writes them (the rules deny
// clients both reads and writes).
//
// aiUsage/{uid}:       {day, attempts, successes, lastAt}  one user's counters for one Nairobi day
// aiUsageDaily/{day}:  {count, minute, minuteCount}        all users' model calls that day, and in the current minute
//
// Rules, per Nairobi day:
// - The user's daily slot is used only by a success: one success, then 'limit' until tomorrow.
// - At most ATTEMPTS_PER_USER_PER_DAY model calls per user, failed or not; then 'limit'.
// - At most GLOBAL_ATTEMPTS_PER_DAY model calls in total, and GLOBAL_ATTEMPTS_PER_MINUTE in one minute; then 'busy'.
// - 'limit' and 'busy' write nothing, so a refused request never costs the user an attempt.
// Two requests racing past the check can both succeed; ATTEMPTS_PER_USER_PER_DAY still bounds that.

import {
  ATTEMPTS_PER_USER_PER_DAY, GLOBAL_ATTEMPTS_PER_DAY, GLOBAL_ATTEMPTS_PER_MINUTE, SUCCESSES_PER_USER_PER_DAY,
} from './config.js';

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;// Kenya is UTC+3 all year (no daylight saving)

// The calendar date in Nairobi as YYYY-MM-DD, from the SERVER's clock. The app's rule against
// toISOString().split('T')[0] is about the device's local date; here the UTC+3 shift is applied first on
// purpose, so the result is the Nairobi date wherever the function runs.
export function nairobiDay(nowMs) {
  return new Date(nowMs + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// Today's counters from a stored doc (missing, malformed or from another day counts as zero)
function usageFor(usage, day) {
  if (!usage || usage.day !== day) return {attempts: 0, successes: 0};
  return {attempts: count(usage.attempts), successes: count(usage.successes)};
}

/**
 * @typedef {{day: string, attempts: number, successes: number, lastAt: number}} UsageDoc
 * @typedef {{count: number, minute: number, minuteCount: number}} DailyDoc
 */

/**
 * @param {{disabled: boolean, usage: Record<string, any> | null, daily: Record<string, any> | null, now: number}} state
 *   usage: aiUsage/{uid} data; daily: aiUsageDaily/{nairobiDay(now)} data (stored data, so not trusted)
 * @returns {{action: 'disabled' | 'limit' | 'busy'} |
 *           {action: 'allow', day: string, usage: UsageDoc, daily: DailyDoc}}
 */
export function decideAttempt({disabled, usage, daily, now}) {
  if (disabled) return {action: 'disabled'};
  const day = nairobiDay(now);
  const user = usageFor(usage, day);
  if (user.successes >= SUCCESSES_PER_USER_PER_DAY) return {action: 'limit'};
  if (user.attempts >= ATTEMPTS_PER_USER_PER_DAY) return {action: 'limit'};

  const total = count(daily?.count);
  if (total >= GLOBAL_ATTEMPTS_PER_DAY) return {action: 'busy'};
  const minute = Math.floor(now / 60000);
  const inMinute = daily?.minute === minute ? count(daily.minuteCount) : 0;
  if (inMinute >= GLOBAL_ATTEMPTS_PER_MINUTE) return {action: 'busy'};

  return {
    action: 'allow',
    day,
    usage: {day, attempts: user.attempts + 1, successes: user.successes, lastAt: now},
    daily: {count: total + 1, minute, minuteCount: inMinute + 1},
  };
}

// The aiUsage doc after a successful generation for `day` (the day decideAttempt returned).
// Re-read inside a second transaction, so a concurrent attempt's count is kept.
/**
 * @param {Record<string, any> | null} usage
 * @param {string} day
 * @param {number} now
 * @returns {UsageDoc}
 */
export function recordSuccess(usage, day, now) {
  const user = usageFor(usage, day);
  return {day, attempts: user.attempts, successes: user.successes + 1, lastAt: now};
}
