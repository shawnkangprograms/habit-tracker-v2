// The reflection record (docs/PACKS_REPORTS_SPEC.md, section 12). Pure. Stored per user under reflections:v1:<uid>
// on this phone (services/reflectionsStoreCore.ts), kept on sign-out like the packs record. Nothing in Stage 3
// sends it anywhere: not sync, not Firestore, not the insight function, not the admin screens. Stage 9 adds one
// audited export path under the section 12 AI rules.
//
// { version: 1, days: { 'YYYY-MM-DD': { [habitId]: {feel, amount, helped, blocker, text?, savedAt} } } }
// One reflection per habit per day, not editable in Stage 3. The date is the day of the tick it describes.

import {isDateString, type GamiReflection} from '@/utils/gamification';
import {QUESTIONS, isAnswerTag, type Answers} from '@/utils/reflections/questions';

export const REFLECTION_TEXT_MAX = 200;

export type Reflection = Answers & {text?: string; savedAt: number};
export type ReflectionsRecord = {version: 1; days: Record<string, Record<string, Reflection>>};
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
  return entry;
}

// Missing: 'none'. Not JSON or not the record's shape: 'corrupt' (reads as no reflections; the next save replaces
// it). A single malformed entry is skipped, not the whole record.
export function parseReflections(raw: string | null): ParsedReflections {
  if (raw === null) return {kind: 'none'};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {kind: 'corrupt'};
  }
  if (typeof data !== 'object' || data === null) return {kind: 'corrupt'};
  const d = data as Record<string, unknown>;
  if (d.version !== 1 || typeof d.days !== 'object' || d.days === null || Array.isArray(d.days)) return {kind: 'corrupt'};

  const record = emptyRecord();
  for (const [date, habits] of Object.entries(d.days as Record<string, unknown>)) {
    if (!isDateString(date) || typeof habits !== 'object' || habits === null) continue;
    for (const [habitId, value] of Object.entries(habits as Record<string, unknown>)) {
      const entry = parseEntry(value);
      if (entry) (record.days[date] ??= {})[habitId] = entry;
    }
  }
  return {kind: 'ok', record};
}

export function serialiseReflections(record: ReflectionsRecord): string {
  return JSON.stringify(record);
}

// ---------- Reading and adding ----------

export function recordOf(parsed: ParsedReflections): ReflectionsRecord {
  return parsed.kind === 'ok' ? parsed.record : emptyRecord();
}

export function findReflection(record: ReflectionsRecord, habitId: string, date: string): Reflection | null {
  return record.days[date]?.[habitId] ?? null;
}

// A new record with this reflection added; null if that habit already has one that day (no editing in Stage 3)
export function addReflection(
  record: ReflectionsRecord,
  input: {habitId: string; date: string; answers: Answers; text: string; savedAt: number},
): ReflectionsRecord | null {
  if (findReflection(record, input.habitId, input.date)) return null;
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
