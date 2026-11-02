// The onboarding record kept on this phone only (docs/ONBOARDING_SPEC.md, section 2): one JSON object per uid
// under onboarding:v1:<uid>, never synced, never sent anywhere. Pure; the AsyncStorage read and write live in a
// service. Like the other per-uid local data (insight:v1, celebrated:v1, sync:), it is kept on sign-out.
//
// It never holds Q10: serialiseRecord writes the known fields one by one, and the answers go through
// validateStoredAnswers, which has no badHabit field. addedTemplateIds holds catalog ids only.

import {validateStoredAnswers} from '@/utils/onboarding/flow';
import {TEMPLATE_IDS, isOneOf, type CompleteAnswers, type StoredAnswers, type TemplateId} from '@/utils/onboarding/types';

export const RECORD_VERSION = 1;
export const recordKey = (uid: string) => `onboarding:v1:${uid}`;

export type OnboardingRecord = {
  version: typeof RECORD_VERSION;
  skipped: boolean;// "Skip setup" on the first run
  answers: StoredAnswers | null;// the last finished run (first or retake), without Q10
  completedAt: number | null;// ms
  addedTemplateIds: TemplateId[];// catalog templates created by any run, for retake dedupe
};

// 'corrupt' still counts as a record: it never brings the first-run flow back
export type ParsedRecord = {kind: 'none'} | {kind: 'corrupt'} | {kind: 'ok'; record: OnboardingRecord};

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function templateIds(ids: readonly unknown[]): TemplateId[] {
  return [...new Set(ids.filter((id): id is TemplateId => isOneOf(TEMPLATE_IDS, id)))];
}

// Never throws. Unknown fields are dropped; unknown or repeated template ids are dropped.
export function parseRecord(raw: string | null): ParsedRecord {
  if (raw === null) return {kind: 'none'};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {kind: 'corrupt'};
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {kind: 'corrupt'};
  const o = v as Record<string, unknown>;
  if (o.version !== RECORD_VERSION || typeof o.skipped !== 'boolean') return {kind: 'corrupt'};
  if (o.completedAt !== null && !isTime(o.completedAt)) return {kind: 'corrupt'};
  if (!Array.isArray(o.addedTemplateIds)) return {kind: 'corrupt'};
  let answers: StoredAnswers | null = null;
  if (o.answers !== null) {
    const result = validateStoredAnswers(o.answers);
    if (!result.valid) return {kind: 'corrupt'};
    answers = result.value;
  }
  return {
    kind: 'ok',
    record: {version: RECORD_VERSION, skipped: o.skipped, answers, completedAt: o.completedAt, addedTemplateIds: templateIds(o.addedTemplateIds)},
  };
}

export function serialiseRecord(record: OnboardingRecord): string {
  const answers = record.answers ? validateStoredAnswers(record.answers) : null;
  return JSON.stringify({
    version: RECORD_VERSION,
    skipped: record.skipped,
    answers: answers?.valid ? answers.value : null,
    completedAt: record.completedAt,
    addedTemplateIds: templateIds(record.addedTemplateIds),
  });
}

// "Skip setup" on the first run: never shown automatically again
export function skippedRecord(): OnboardingRecord {
  return {version: RECORD_VERSION, skipped: true, answers: null, completedAt: null, addedTemplateIds: []};
}

// A finished run (first or retake): the new answers without Q10; templates added earlier are kept
export function completedRecord(previous: OnboardingRecord | null, answers: CompleteAnswers, now: number): OnboardingRecord {
  const {badHabit: _q10, ...stored} = answers;
  return {
    version: RECORD_VERSION,
    skipped: false,
    answers: stored,
    completedAt: now,
    addedTemplateIds: previous?.addedTemplateIds ?? [],
  };
}

// After each habit is created: its template id joins the list (catalog ids only, no repeats)
export function withAddedTemplates(record: OnboardingRecord, ids: readonly string[]): OnboardingRecord {
  return {...record, addedTemplateIds: templateIds([...record.addedTemplateIds, ...ids])};
}
