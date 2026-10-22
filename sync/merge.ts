// Pure sync logic: Firestore doc <-> local row mapping, remote-doc validation and last-write-wins decisions.
// No database, Firebase or React imports. The sync engine (stages 2-3) does the I/O.
//
// Rules (locked):
// - Last-write-wins per document on updatedAt (client ms). On a tie the local copy wins.
// - Deletes are sticky: once either copy of a habit is deleted, the merged habit stays deleted.
// - System rows (updatedAt = 0) never leave the device.
// - A doc's userId is never trusted: docToHabit returns no userId; the caller sets the signed-in uid.
// - serverUpdatedAt (serverTimestamp, the pull cursor) is added by the engine, not here.

import {validateHabitInput} from '@/validation/validators';
import type {IconId, RemindBeforeMin, WeekdayKey} from '@/constants/habits';

export const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch; headroom for safety

// Version of the remote-doc parsing rules (docToHabit / docToCompletion and the validators behind them).
// Bump it whenever parsing accepts something new (e.g. new icons): the pull cursors then reset and every
// phone re-reads all docs once, so docs it skipped as invalid before are picked up.
// 2: alarm and remindBeforeMin. A phone on an older build stored pulled docs without them, so every phone
// re-reads all docs once after updating and picks up their values.
export const PARSER_VERSION = 2;

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // stored order in docs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = ['user', 'ai_suggested'] as const;

// ---------- Shapes ----------

// A habit as the engine reads it from SQLite (habits row + its habitDays), without userId
export type LocalHabit = {
  habitId: string;
  habitName: string;
  icon: IconId;
  frequencyType: 'daily' | 'weekdays';
  days: WeekdayKey[]; // empty for daily
  reminderTime: string | null;
  alarm: boolean;
  remindBeforeMin: RemindBeforeMin;
  source: (typeof SOURCES)[number];
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
};

// users/{uid}/habits/{habitId}, minus serverUpdatedAt
export type HabitDoc = Omit<LocalHabit, 'habitId'>;

// A completions row; completed is the SQLite 0/1
export type LocalCompletion = {habitId: string; date: string; completed: 0 | 1; updatedAt: number};

// users/{uid}/completions/{habitId}_{date}, minus serverUpdatedAt
export type CompletionDoc = LocalCompletion;

// ---------- Small checks ----------

export function isHabitId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

// YYYY-MM-DD that is a real calendar date
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function sortDays(days: readonly WeekdayKey[]): WeekdayKey[] {
  return DAY_ORDER.filter((d) => days.includes(d));
}

// System rows (ensureTodayRows / backfill) have updatedAt = 0 and are never pushed
export function isPushable(updatedAt: number): boolean {
  return updatedAt > 0;
}

// ---------- Habits ----------

export function habitToDoc(habit: LocalHabit): HabitDoc {
  return {
    habitName: habit.habitName,
    icon: habit.icon,
    frequencyType: habit.frequencyType,
    days: habit.frequencyType === 'weekdays' ? sortDays(habit.days) : [],
    reminderTime: habit.reminderTime,
    alarm: habit.alarm,
    remindBeforeMin: habit.remindBeforeMin,
    source: habit.source,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    deleted: habit.deleted,
  };
}

// A remote habit doc as a LocalHabit, or null if it fails the app's own rules (same validators as the form).
// The rules are looser on purpose (name up to 60, any icon string), so a doc from a newer app version
// with an unknown icon is skipped here rather than corrupting local data.
// alarm / remindBeforeMin may be missing (a doc written by an older build): off / 0. Present but invalid: skipped.
export function docToHabit(habitId: string, data: unknown): LocalHabit | null {
  if (!isHabitId(habitId) || typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  if (d.frequencyType !== 'daily' && d.frequencyType !== 'weekdays') return null;
  const checked = validateHabitInput({
    habitName: d.habitName,
    icon: d.icon,
    frequency: d.frequencyType === 'daily' ? {type: 'daily'} : {type: 'weekdays', days: d.days},
    reminderTime: d.reminderTime,
    alarm: d.alarm,
    remindBeforeMin: d.remindBeforeMin,
  });
  if (!checked.valid) return null;
  if (d.reminderTime === undefined) return null; // must be present (null = no reminder)
  if (!(SOURCES as readonly unknown[]).includes(d.source)) return null;
  if (!isPositiveInt(d.createdAt) || !isPositiveInt(d.updatedAt)) return null;
  if (typeof d.deleted !== 'boolean') return null;

  const frequency = checked.value.frequency;
  return {
    habitId,
    habitName: checked.value.habitName,
    icon: checked.value.icon,
    frequencyType: frequency.type,
    days: frequency.type === 'weekdays' ? sortDays(frequency.days) : [],
    reminderTime: checked.value.reminderTime,
    alarm: checked.value.alarm,
    remindBeforeMin: checked.value.remindBeforeMin,
    source: d.source as LocalHabit['source'],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deleted: d.deleted,
  };
}

function sameHabit(a: LocalHabit, b: LocalHabit): boolean {
  return a.habitId === b.habitId
    && a.habitName === b.habitName
    && a.icon === b.icon
    && a.frequencyType === b.frequencyType
    && sortDays(a.days).join(',') === sortDays(b.days).join(',')
    && a.reminderTime === b.reminderTime
    && a.alarm === b.alarm
    && a.remindBeforeMin === b.remindBeforeMin
    && a.source === b.source
    && a.createdAt === b.createdAt
    && a.updatedAt === b.updatedAt
    && a.deleted === b.deleted;
}

export type HabitMerge = {
  habit: LocalHabit; // the merged result
  writeLocal: boolean; // the local row (and habitDays) must be replaced with `habit`
  needsPush: boolean; // `habit` differs from the remote copy, so it must be pushed (synced = 0)
};

// Last-write-wins with sticky delete. The newer copy's content wins (tie: local), deleted is true if either
// copy is deleted, updatedAt is the larger of the two, and createdAt is the remote one (the server keeps
// createdAt fixed). The rules require updatedAt >= the stored one, which max() guarantees for the push.
export function mergeHabit(local: LocalHabit | null, remote: LocalHabit): HabitMerge {
  if (local === null) return {habit: remote, writeLocal: true, needsPush: false};

  const newer = remote.updatedAt > local.updatedAt ? remote : local;
  const merged: LocalHabit = {
    ...newer,
    days: sortDays(newer.days),
    deleted: local.deleted || remote.deleted,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    createdAt: remote.createdAt,
  };
  return {habit: merged, writeLocal: !sameHabit(merged, local), needsPush: !sameHabit(merged, remote)};
}

// ---------- Completions ----------

export function completionDocId(habitId: string, date: string): string {
  return `${habitId}_${date}`;
}

// Inverse of completionDocId. Neither a UUID nor a date contains "_", so there is exactly one.
export function parseCompletionDocId(docId: string): {habitId: string; date: string} | null {
  const parts = docId.split('_');
  if (parts.length !== 2 || !isHabitId(parts[0]) || !isDate(parts[1])) return null;
  return {habitId: parts[0], date: parts[1]};
}

export function completionToDoc(row: LocalCompletion): CompletionDoc {
  return {habitId: row.habitId, date: row.date, completed: row.completed, updatedAt: row.updatedAt};
}

// A remote completion doc as a LocalCompletion, or null if invalid. completed must be the int 0 or 1
// (not a boolean), and the fields must match the doc id.
export function docToCompletion(docId: string, data: unknown): LocalCompletion | null {
  const key = parseCompletionDocId(docId);
  if (!key || typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.habitId !== key.habitId || d.date !== key.date) return null;
  if (d.completed !== 0 && d.completed !== 1) return null;
  if (!isPositiveInt(d.updatedAt)) return null;
  return {habitId: key.habitId, date: key.date, completed: d.completed, updatedAt: d.updatedAt};
}

// Last-write-wins for completions: apply the remote copy only if there is no local row or it is strictly newer
export function shouldApplyRemote(localUpdatedAt: number | null, remoteUpdatedAt: number): boolean {
  return localUpdatedAt === null || remoteUpdatedAt > localUpdatedAt;
}

// ---------- Batching ----------

export function chunk<T>(items: readonly T[], size: number = BATCH_LIMIT): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be a positive integer');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
