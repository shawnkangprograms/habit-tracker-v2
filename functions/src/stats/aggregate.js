// Admin stats: one stats/{YYYY-MM-DD} document per Nairobi day, computed from plain rows. PURE: no Firebase
// imports, no clock (the caller passes nowMs). The loader (load.js) turns Firestore and Auth data into the rows
// below; index.js writes what computeDayStats returns.
//
// Output is counts only: no uids, names, emails or habit names, ever. Every stat is computed twice: `all` (every
// account) and `real` (accounts whose users/{uid}.test is not true).
//
// DUPLICATED FROM THE APP, and kept identical by functions/test/stats-parity.test.ts, which runs both on random
// data (its header names the exact app files; they are not named here because the app's isolation tests keep
// on-device features out of every Cloud Functions file, comments included):
// - calendar stepping: toDayNumber / fromDayNumber / weekdayOf
// - isScheduledOn (not deleted, created on or before the date, daily or due that weekday, CURRENT schedule only)
// - the S-2 clamp: createdDate = min(createdDate, today)
// - per-day scheduled / done (deleted habits drop out of every day, completions after today ignored)
// - ICON_AREA (icon -> area, unknown icons Not counted) and the AREAS list
// The functions package can't import the app's TypeScript (separate package, deployed alone), hence the copies.
//
// Approximations (the Stats screen must label them):
// - completion rate is "rebuilt from schedules": the server only holds the days a user ticked or unticked (the
//   phone's automatic "not done" rows have updatedAt 0 and are never pushed), so scheduled days come from each
//   habit's createdAt and CURRENT frequency, exactly like the app's own known limitation.
// - createdDate is the Nairobi date of createdAt; the app uses the phone's local date (the same in Kenya).
// - habits by area are "by icon": any area chosen on the phone stays on the phone.
// - "opened the app" uses Auth's last token refresh, which keeps only the LATEST time; so it is measurable only
//   while the day is recent (OPENED_MEASURABLE_MS after its start) and is left out of older, backfilled days.
// - "logged a habit" uses serverUpdatedAt, the time of the LAST write of a habit or completion document.
//   completionActive counts only accounts that logged a habit in the 7 days ending that day, by that measure.
// - habit composition (area, source, frequency, reminders, habits per user) is the state at compute time.

export const STATS_VERSION = 2;// 2: completionActive (accounts that logged a habit in the 7 days ending that day)
export const SIGNUP_WEEKS = 13;// sign-ups per week: this many Monday-start weeks, ending with the day's week
export const OPENED_MEASURABLE_MS = 2 * 24 * 60 * 60 * 1000;// "opened" only for days that started < 2 days ago

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;// Kenya is UTC+3 all year (no daylight saving)
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS_BY_UTC_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// The app's six areas in its own order, plus 'none' (Not counted). Parity-tested.
export const AREAS = ['Learning', 'Mind', 'Career', 'Discipline', 'Relations', 'Health', 'none'];

// Copy of the app's ICON_AREA (parity-tested). star and unknown icons are Not counted.
export const ICON_AREA = Object.freeze({
  run: 'Health', water: 'Health', food: 'Health', sleep: 'Health',
  meditate: 'Mind', music: 'Mind',
  work: 'Career', money: 'Career',
  book: 'Learning', study: 'Learning',
  heart: 'Relations',
});

export const HABITS_PER_USER_BUCKETS = ['0', '1', '2', '3', '4', '5', '6-9', '10+'];

// ---------- Calendar (copies of utils/gamification.ts) ----------

export function isDateString(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function toDayNumber(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  const pad = (v, len = 2) => String(v).padStart(len, '0');
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function weekdayOf(dayNumber) {
  return WEEKDAYS_BY_UTC_DAY[new Date(dayNumber * DAY_MS).getUTCDay()];
}

export function addDays(date, n) {
  return fromDayNumber(toDayNumber(date) + n);
}

// ---------- Nairobi time ----------

// The Nairobi calendar date of a ms timestamp (same as nairobiDay in ../dailyLimit.js)
export function nairobiDateOf(ms) {
  return new Date(ms + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

// ms of 00:00 Nairobi on that date
export function nairobiDayStartMs(date) {
  return toDayNumber(date) * DAY_MS - NAIROBI_OFFSET_MS;
}

// ---------- Scheduling (copies of the app's rules; parity-tested) ----------

// habit: {createdDate, frequencyType, days, deleted}
export function isScheduledOn(habit, date) {
  if (habit.deleted || habit.createdDate > date) return false;
  return habit.frequencyType === 'daily' || habit.days.includes(weekdayOf(toDayNumber(date)));
}

// S-2: a createdDate after today counts from today; no past day is invented for it
export function clampCreatedDate(habit, today) {
  return isDateString(habit.createdDate) && habit.createdDate > today ? {...habit, createdDate: today} : habit;
}

// One user's {scheduled, done} for each date in `dates`, by the app's per-day completion rules.
// habits: {habitId, createdDate, frequencyType, days, deleted}; completions: {habitId, date, completed: boolean}.
// `today` is the real current date (S-2 clamp, completions after it ignored), not the reported day.
export function dayCounts(habits, completions, dates, today) {
  const active = habits.map((h) => clampCreatedDate(h, today)).filter((h) => !h.deleted && isDateString(h.createdDate));
  const doneKeys = new Set(completions
    .filter((c) => c.completed === true && isDateString(c.date) && c.date <= today)
    .map((c) => `${c.habitId}|${c.date}`));
  return dates.map((date) => {
    const scheduled = active.filter((h) => isScheduledOn(h, date));
    return {date, scheduled: scheduled.length, done: scheduled.filter((h) => doneKeys.has(`${h.habitId}|${date}`)).length};
  });
}

export function iconArea(icon) {
  return Object.hasOwn(ICON_AREA, icon) ? ICON_AREA[icon] : 'none';
}

// ---------- Input normalising ----------

const finiteMs = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

// Firestore habit row -> the app's GamiHabit shape (plus what the composition stats need)
function toHabit(row) {
  const createdAt = finiteMs(row.createdAt);
  return {
    uid: row.uid,
    habitId: row.habitId,
    createdDate: createdAt === null ? null : nairobiDateOf(createdAt),
    frequencyType: row.frequencyType === 'weekdays' ? 'weekdays' : 'daily',
    days: row.frequencyType === 'weekdays' && Array.isArray(row.days) ? row.days : [],
    deleted: row.deleted === true,
    icon: typeof row.icon === 'string' ? row.icon : '',
    source: row.source,
    hasReminder: typeof row.reminderTime === 'string' && row.reminderTime.length > 0,
    serverUpdatedMs: finiteMs(row.serverUpdatedMs),
  };
}

function bucketOf(count) {
  if (count <= 5) return String(count);
  return count <= 9 ? '6-9' : '10+';
}

// Monday on or before `date`
function weekStartOf(date) {
  const n = toDayNumber(date);
  const back = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;// Mon 0 .. Sun 6
  return fromDayNumber(n - back);
}

// ---------- One section (all accounts, or real accounts only) ----------

function computeSection({accounts, habits, completionsByUid, aiModelCalls}, day, today, nowMs) {
  const dayStart = nairobiDayStartMs(day);
  const dayEnd = dayStart + DAY_MS;
  const weekStart = nairobiDayStartMs(addDays(day, -6));
  const inDay = (ms) => ms !== null && ms >= dayStart && ms < dayEnd;
  const inWeek = (ms) => ms !== null && ms >= weekStart && ms < dayEnd;

  // accounts that existed by the end of the day
  const existing = accounts.filter((a) => a.createdMs === null || a.createdMs < dayEnd);

  // active users
  const loggedDay = new Set();
  const loggedWeek = new Set();
  const noteWrite = (uid, ms) => {
    if (inDay(ms)) loggedDay.add(uid);
    if (inWeek(ms)) loggedWeek.add(uid);
  };
  for (const h of habits) noteWrite(h.uid, h.serverUpdatedMs);
  for (const [uid, rows] of completionsByUid) for (const c of rows) noteWrite(uid, c.serverUpdatedMs);

  const activeUsers = {loggedDay: loggedDay.size, loggedWeek: loggedWeek.size};
  if (nowMs - dayStart < OPENED_MEASURABLE_MS) {
    // last refresh on or after the start of the day (or week): "opened since"
    activeUsers.openedDay = accounts.filter((a) => a.lastRefreshMs !== null && a.lastRefreshMs >= dayStart).length;
    activeUsers.openedWeek = accounts.filter((a) => a.lastRefreshMs !== null && a.lastRefreshMs >= weekStart).length;
  }

  // sign-ups: that day, and per Monday-start week
  const firstWeek = addDays(weekStartOf(day), -7 * (SIGNUP_WEEKS - 1));
  const perWeek = Array.from({length: SIGNUP_WEEKS}, (_, i) => ({weekStart: addDays(firstWeek, 7 * i), count: 0}));
  let signupsDay = 0;
  for (const a of accounts) {
    if (a.createdMs === null || a.createdMs >= dayEnd) continue;
    const created = nairobiDateOf(a.createdMs);
    if (created === day) signupsDay += 1;
    const index = Math.floor((toDayNumber(weekStartOf(created)) - toDayNumber(firstWeek)) / 7);
    if (index >= 0 && index < SIGNUP_WEEKS) perWeek[index].count += 1;
  }

  // completion rate for the day, rebuilt from schedules
  const habitsByUid = new Map();
  for (const h of habits) {
    if (!habitsByUid.has(h.uid)) habitsByUid.set(h.uid, []);
    habitsByUid.get(h.uid).push(h);
  }
  // completion: every account (kept for reference); completionActive: only accounts that logged a habit in the
  // 7 days ending that day (loggedWeek), so abandoned accounts don't drag the rate down. The chart uses the active one.
  let scheduled = 0;
  let done = 0;
  const activeCompletion = {scheduled: 0, done: 0, accounts: 0};
  for (const [uid, userHabits] of habitsByUid) {
    const [counts] = dayCounts(userHabits, completionsByUid.get(uid) ?? [], [day], today);
    scheduled += counts.scheduled;
    done += counts.done;
    if (loggedWeek.has(uid)) {
      activeCompletion.scheduled += counts.scheduled;
      activeCompletion.done += counts.done;
    }
  }
  activeCompletion.accounts = loggedWeek.size;

  // habit composition: active (not deleted) habits, now
  const active = habits.filter((h) => !h.deleted);
  const byArea = Object.fromEntries(AREAS.map((a) => [a, 0]));
  const source = {user: 0, ai_suggested: 0, other: 0};
  const frequency = {daily: 0, weekdays: 0};
  let withReminder = 0;
  const perUserCount = new Map(existing.map((a) => [a.uid, 0]));
  for (const h of active) {
    byArea[iconArea(h.icon)] += 1;
    source[h.source === 'user' || h.source === 'ai_suggested' ? h.source : 'other'] += 1;
    frequency[h.frequencyType] += 1;
    if (h.hasReminder) withReminder += 1;
    perUserCount.set(h.uid, (perUserCount.get(h.uid) ?? 0) + 1);
  }
  const habitsPerUser = Object.fromEntries(HABITS_PER_USER_BUCKETS.map((b) => [b, 0]));
  for (const count of perUserCount.values()) habitsPerUser[bucketOf(count)] += 1;

  return {
    accounts: existing.length,
    activeUsers,
    signups: {day: signupsDay, perWeek},
    completion: {scheduled, done},
    completionActive: activeCompletion,
    habits: {total: active.length, byArea, source, frequency, withReminder, perUser: habitsPerUser},
    aiInsights: {modelCalls: aiModelCalls},
  };
}

// ---------- Entry point ----------

/**
 * input:
 *   authUsers:   [{uid, createdMs: number|null, lastRefreshMs: number|null}]
 *   testUids:    iterable of uids whose users/{uid}.test === true
 *   habits:      [{uid, habitId, icon, frequencyType, days, reminderTime, source, createdAt, deleted, serverUpdatedMs}]
 *   completions: [{uid, habitId, date, completed: 0|1|boolean, serverUpdatedMs}]
 *   aiDaily:     {[YYYY-MM-DD]: count}  model calls that day, all accounts (aiUsageDaily)
 *   aiUsage:     [{uid, day, attempts}] each user's counters for their LATEST day only (aiUsage)
 * day: the Nairobi date reported. nowMs: the real current time.
 * Returns the stats/{day} document body (counts only). Keys that can't be measured are left out, not null, so a
 * merge write keeps an earlier value (index.js writes with merge).
 */
export function computeDayStats(input, day, nowMs) {
  if (!isDateString(day)) throw new Error(`day must be YYYY-MM-DD, got "${day}"`);
  const today = nairobiDateOf(nowMs);
  const testUids = new Set(input.testUids ?? []);
  const isReal = (uid) => !testUids.has(uid);

  // every uid that appears anywhere is an account; Auth gives its times when known
  const accountsByUid = new Map();
  for (const a of input.authUsers ?? []) {
    accountsByUid.set(a.uid, {uid: a.uid, createdMs: finiteMs(a.createdMs), lastRefreshMs: finiteMs(a.lastRefreshMs)});
  }
  const habits = (input.habits ?? []).map(toHabit);
  for (const h of habits) {
    if (!accountsByUid.has(h.uid)) accountsByUid.set(h.uid, {uid: h.uid, createdMs: null, lastRefreshMs: null});
  }
  const accounts = [...accountsByUid.values()];

  const completionsByUid = new Map();
  for (const c of input.completions ?? []) {
    if (!completionsByUid.has(c.uid)) completionsByUid.set(c.uid, []);
    completionsByUid.get(c.uid).push({
      habitId: c.habitId,
      date: c.date,
      completed: c.completed === 1 || c.completed === true,
      serverUpdatedMs: finiteMs(c.serverUpdatedMs),
    });
  }

  const allCalls = Number.isInteger(input.aiDaily?.[day]) && input.aiDaily[day] > 0 ? input.aiDaily[day] : 0;
  // real: minus the test accounts' attempts recorded for that day (exact while their counters are still on it)
  const testCalls = (input.aiUsage ?? [])
    .filter((u) => !isReal(u.uid) && u.day === day && Number.isInteger(u.attempts) && u.attempts > 0)
    .reduce((sum, u) => sum + u.attempts, 0);

  const filterMap = (map, keep) => new Map([...map].filter(([uid]) => keep(uid)));

  return {
    version: STATS_VERSION,
    day,
    all: computeSection({accounts, habits, completionsByUid, aiModelCalls: allCalls}, day, today, nowMs),
    real: computeSection({
      accounts: accounts.filter((a) => isReal(a.uid)),
      habits: habits.filter((h) => isReal(h.uid)),
      completionsByUid: filterMap(completionsByUid, isReal),
      aiModelCalls: Math.max(0, allCalls - testCalls),
    }, day, today, nowMs),
  };
}

// The earliest completion date the loader must fetch to compute `days`: the week before the oldest day, so late
// syncs of the "logged this week" window are seen too
export function completionWindowStart(days) {
  const oldest = [...days].sort()[0];
  return addDays(oldest, -7);
}

// refreshStats rate limit: at most once a minute (lastAt: ms of the last accepted refresh, or null)
export const REFRESH_INTERVAL_MS = 60 * 1000;
export function refreshAllowed(lastAt, nowMs) {
  return !(typeof lastAt === 'number' && Number.isFinite(lastAt) && nowMs - lastAt < REFRESH_INTERVAL_MS && nowMs >= lastAt);
}

// The days refreshStats recomputes: today and the (n - 1) days before it, oldest first; n is clamped to 1..30
export const MAX_REFRESH_DAYS = 30;
export function refreshDays(n, nowMs) {
  const count = Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_REFRESH_DAYS) : 1;
  const today = nairobiDateOf(nowMs);
  return Array.from({length: count}, (_, i) => addDays(today, i - count + 1));
}
