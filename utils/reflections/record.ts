// The reflection record (docs/PACKS_REPORTS_SPEC.md, section 12). Pure. Stored per user under reflections:v1:<uid>
// on this phone (services/reflectionsStoreCore.ts), kept on sign-out like the packs record. Nothing in Stage 3
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
