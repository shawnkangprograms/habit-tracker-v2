// The reflection record (docs/PACKS_REPORTS_SPEC.md, section 12). Pure. Stored per user on this phone, one item per
// year under reflections:v2:<uid>:<yyyy> since F-1 (the year helpers at the end; services/reflectionsStoreCore.ts
// reads and writes them), kept on sign-out like the packs record. Nothing in Stage 3
// sends it anywhere: not sync, not Firestore, not the insight function, not the admin screens. Stage 9 adds one
// audited export path under the section 12 AI rules.
//
// { version: 1, days: { 'YYYY-MM-DD': { [habitId]: {feel, amount, helped, blocker, text?, savedAt} } } }
// One reflection per habit per day, not editable in Stage 3. The date is the day of the tick it describes.
//
// P-8 (docs/PACKS_REPORTS_SPEC.md, section 17): what this build can't read is kept and written back unchanged.
// Keys it doesn't know, on the record and on each entry, ride in `unknownFields`; a day or an entry it can't
// read rides in `unreadDays`, keyed as stored. An unreadable entry counts as "already reflected" (hasReflection),
// so it is never written over, and it never earns XP (only `days` reaches the XP engine). Parsing and serialising
// never look at the storage key or at which days the record holds, so a record holding only some days (F-1's
// one item per year) goes through them unchanged.

import {isDateString, type GamiReflection} from '@/utils/gamification';
import {QUESTIONS, isAnswerTag, type Answers} from '@/utils/reflections/questions';
import {collectUnknown, hasOwnKey, isPlainObject, withUnknown, type UnknownFields} from '@/utils/unknownFields';

export const REFLECTION_TEXT_MAX = 200;

export type Reflection = Answers & {text?: string; savedAt: number; unknownFields?: UnknownFields};
// unreadDays[key]: for a readable date, an object of that day's entries this build can't read; otherwise the
// stored value of that key, whatever it is
export type ReflectionsRecord = {
  version: 1;
  days: Record<string, Record<string, Reflection>>;
  unknownFields?: UnknownFields;
  unreadDays?: Readonly<Record<string, unknown>>;
};

const RECORD_KEYS: ReadonlySet<string> = new Set(['version', 'days']);
const ENTRY_KEYS: ReadonlySet<string> = new Set([...QUESTIONS.map((q) => q.id), 'text', 'savedAt']);
export type ParsedReflections = {kind: 'ok'; record: ReflectionsRecord} | {kind: 'none'} | {kind: 'corrupt'};

// The record before F-1 (one item for every year): read, never written or deleted by builds with F-1
export const reflectionsKey = (uid: string) => `reflections:v1:${uid}`;
export const emptyRecord = (): ReflectionsRecord => ({version: 1, days: {}});

// ---------- Free text ----------

// Control characters go (line breaks stay), then the ends are trimmed. Counted in characters, not UTF-16 units.
export function cleanText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}

export const textLength = (text: string) => Array.from(text).length;

export function textError(raw: string): string | null {
  return textLength(cleanText(raw)) > REFLECTION_TEXT_MAX ? 'tooLong' : null;
}

// ---------- Parsing ----------

function parseEntry(value: unknown): Reflection | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!QUESTIONS.every((q) => isAnswerTag(q.id, v[q.id]))) return null;
  if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return null;
  const entry = {...Object.fromEntries(QUESTIONS.map((q) => [q.id, v[q.id]])), savedAt: v.savedAt} as Reflection;
  if (typeof v.text === 'string' && v.text.length > 0) entry.text = v.text;
  const unknownFields = collectUnknown(v, ENTRY_KEYS);
  if (unknownFields) entry.unknownFields = unknownFields;
  return entry;
}

// Missing: 'none'. Not JSON or not the record's shape (including another version): 'corrupt' (reads as no
// reflections; the next save replaces it). A day or an entry this build can't read is kept aside (unreadDays),
// not counted, and written back as it was.
export function parseReflections(raw: string | null): ParsedReflections {
  if (raw === null) return {kind: 'none'};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {kind: 'corrupt'};
  }
  if (!isPlainObject(data)) return {kind: 'corrupt'};
  if (data.version !== 1 || !isPlainObject(data.days)) return {kind: 'corrupt'};

  const record = emptyRecord();
  const unread: [string, unknown][] = [];
  for (const [date, habits] of Object.entries(data.days)) {
    if (!isDateString(date) || !isPlainObject(habits)) {
      unread.push([date, habits]);
      continue;
    }
    const unreadEntries: [string, unknown][] = [];
    for (const [habitId, value] of Object.entries(habits)) {
      const entry = parseEntry(value);
      if (entry) (record.days[date] ??= {})[habitId] = entry;
      else unreadEntries.push([habitId, value]);
    }
    if (unreadEntries.length > 0) unread.push([date, Object.freeze(Object.fromEntries(unreadEntries))]);
  }
  const unknownFields = collectUnknown(data, RECORD_KEYS);
  if (unknownFields) record.unknownFields = unknownFields;
  if (unread.length > 0) record.unreadDays = Object.freeze(Object.fromEntries(unread));
  return {kind: 'ok', record};
}

// Writes the known fields one by one, so nothing else from memory can reach storage; what the parser kept goes
// back where it was, and a readable entry wins over an unreadable one with the same habit and day
function entryValue(e: Reflection) {
  return withUnknown(e.unknownFields, {
    ...Object.fromEntries(QUESTIONS.map((q) => [q.id, e[q.id]])),
    ...(e.text !== undefined ? {text: e.text} : {}),
    savedAt: e.savedAt,
  });
}

export function serialiseReflections(record: ReflectionsRecord): string {
  const unread = record.unreadDays ?? {};
  const days: [string, unknown][] = Object.entries(unread)
    .filter(([date]) => !hasOwnKey(record.days, date));
  for (const [date, habits] of Object.entries(record.days)) {
    const kept = unread[date];
    const known = Object.entries(habits).map(([habitId, e]) => [habitId, entryValue(e)] as const);
    days.push([date, {...(isPlainObject(kept) ? kept : {}), ...Object.fromEntries(known)}]);
  }
  return JSON.stringify(withUnknown(record.unknownFields, {version: 1, days: Object.fromEntries(days)}));
}

// ---------- Reading and adding ----------

export function recordOf(parsed: ParsedReflections): ReflectionsRecord {
  return parsed.kind === 'ok' ? parsed.record : emptyRecord();
}

export function findReflection(record: ReflectionsRecord, habitId: string, date: string): Reflection | null {
  return record.days[date]?.[habitId] ?? null;
}

// Does this habit have a reflection that day, readable or not? An unreadable one (written by a newer build) counts,
// so it is never offered again nor written over (P-8); it earns no XP here.
export function hasReflection(record: ReflectionsRecord, habitId: string, date: string): boolean {
  if (findReflection(record, habitId, date)) return true;
  const unread = record.unreadDays?.[date];
  return isPlainObject(unread) && hasOwnKey(unread, habitId);
}

// A new record with this reflection added; null if that habit already has one that day (no editing in Stage 3)
export function addReflection(
  record: ReflectionsRecord,
  input: {habitId: string; date: string; answers: Answers; text: string; savedAt: number},
): ReflectionsRecord | null {
  if (hasReflection(record, input.habitId, input.date)) return null;
  const text = cleanText(input.text);
  const entry: Reflection = {...input.answers, savedAt: input.savedAt};
  if (text.length > 0) entry.text = text;
  return {...record, days: {...record.days, [input.date]: {...record.days[input.date], [input.habitId]: entry}}};
}

// What the XP engine needs (utils/gamification.ts): never the answers or the text
export function toGamiReflections(record: ReflectionsRecord): GamiReflection[] {
  const out: GamiReflection[] = [];
  for (const [date, habits] of Object.entries(record.days)) {
    for (const [habitId, entry] of Object.entries(habits)) out.push({habitId, date, savedAt: entry.savedAt});
  }
  return out;
}

// ---------- F-1: one item per year (docs/PACKS_REPORTS_SPEC.md, sections 12 and 17) ----------
// reflections:v2:<uid>:<yyyy> holds that year's days in the record's own shape, through parseReflections and
// serialiseReflections above, unchanged. reflections:migrated:v2:<uid> is the marker: the years that exist and the
// length of the v1 record when it was last merged in (a different length means an older build saved to it).

export const reflectionsYearKey = (uid: string, year: string) => `reflections:v2:${uid}:${year}`;
export const reflectionsMarkerKey = (uid: string) => `reflections:migrated:v2:${uid}`;

// The year of one of this user's year keys, or null for any other key (another uid, or not exactly four digits)
export function yearOfKey(uid: string, key: string): string | null {
  const prefix = `reflections:v2:${uid}:`;
  if (!key.startsWith(prefix)) return null;
  const year = key.slice(prefix.length);
  return /^\d{4}$/.test(year) ? year : null;
}

export type ReflectionsMarker = {version: 1; years: string[]; v1Length: number; unknownFields?: UnknownFields};

const MARKER_KEYS: ReadonlySet<string> = new Set(['version', 'years', 'v1Length']);

const isYear = (y: unknown): y is number => typeof y === 'number' && Number.isInteger(y) && y >= 1000 && y <= 9999;

// Missing or not the marker's shape: null (the store then looks for the year keys and merges v1 again)
export function parseMarker(raw: string | null): ReflectionsMarker | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(v) || v.version !== 1 || !Array.isArray(v.years) || !v.years.every(isYear)) return null;
  if (typeof v.v1Length !== 'number' || !Number.isInteger(v.v1Length) || v.v1Length < 0) return null;
  const years = [...new Set(v.years.map(String))].sort();
  const unknownFields = collectUnknown(v, MARKER_KEYS);// P-8
  return unknownFields ? {version: 1, years, v1Length: v.v1Length, unknownFields} : {version: 1, years, v1Length: v.v1Length};
}

export function serialiseMarker(marker: ReflectionsMarker): string {
  const years = [...new Set(marker.years)].sort().map(Number);
  return JSON.stringify(withUnknown(marker.unknownFields, {version: 1, years, v1Length: marker.v1Length}));
}

// Each year's share of a record: its days, and its unreadable entries under a date. The record's own unknown keys
// and unreadable keys that aren't dates belong to no year, so they are not copied (they stay in v1, never written).
export function splitByYear(record: ReflectionsRecord): Map<string, ReflectionsRecord> {
  const parts = new Map<string, {days: [string, Record<string, Reflection>][]; unread: [string, unknown][]}>();
  const part = (year: string) => {
    let p = parts.get(year);
    if (!p) {
      p = {days: [], unread: []};
      parts.set(year, p);
    }
    return p;
  };
  for (const [date, habits] of Object.entries(record.days)) part(date.slice(0, 4)).days.push([date, habits]);
  for (const [key, value] of Object.entries(record.unreadDays ?? {})) {
    if (isDateString(key)) part(key.slice(0, 4)).unread.push([key, value]);
  }
  const out = new Map<string, ReflectionsRecord>();
  for (const [year, p] of parts) {
    const days = Object.fromEntries(p.days);
    out.set(year, p.unread.length > 0
      ? {version: 1, days, unreadDays: Object.freeze(Object.fromEntries(p.unread))}
      : {version: 1, days});
  }
  return out;
}

// `existing` with what `incoming` has that it lacks, or null if it lacks nothing. A habit and day that `existing`
// already has (readable or not) keeps its entry; `existing`'s own unknown keys stay. Used to merge v1 into a year,
// and to build the read view from the years.
export function unionInto(existing: ReflectionsRecord, incoming: ReflectionsRecord): ReflectionsRecord | null {
  const days = new Map(Object.entries(existing.days).map(([date, habits]) => [date, new Map(Object.entries(habits))]));
  const unread = new Map(Object.entries(existing.unreadDays ?? {}));
  const has = (date: string, habitId: string) => {
    const kept = unread.get(date);
    return days.get(date)?.has(habitId) === true || (isPlainObject(kept) && hasOwnKey(kept, habitId));
  };
  let changed = false;
  for (const [date, habits] of Object.entries(incoming.days)) {
    for (const [habitId, entry] of Object.entries(habits)) {
      if (has(date, habitId)) continue;
      let day = days.get(date);
      if (!day) {
        day = new Map();
        days.set(date, day);
      }
      day.set(habitId, entry);
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(incoming.unreadDays ?? {})) {
    const kept = unread.get(key);
    if (isPlainObject(value)) {
      if (kept !== undefined && !isPlainObject(kept)) continue;// an unreadable value already there wins
      const added = Object.entries(value).filter(([habitId]) => !has(key, habitId));
      if (added.length === 0) continue;
      unread.set(key, Object.freeze(Object.fromEntries([...Object.entries((kept ?? {}) as Record<string, unknown>), ...added])));
      changed = true;
    } else if (kept === undefined && !days.has(key)) {
      unread.set(key, value);
      changed = true;
    }
  }
  if (!changed) return null;
  const merged: ReflectionsRecord = {
    ...existing,
    days: Object.fromEntries([...days].map(([date, habits]) => [date, Object.fromEntries(habits)])),
  };
  return unread.size > 0 ? {...merged, unreadDays: Object.freeze(Object.fromEntries(unread))} : merged;
}

// What XP, the bar and the reflect screen read: every year's days in one record. Never saved (a save writes its
// year's own record).
export function mergeYears(records: readonly ReflectionsRecord[]): ReflectionsRecord {
  return records.reduce<ReflectionsRecord>((view, record) => unionInto(view, record) ?? view, emptyRecord());
}
