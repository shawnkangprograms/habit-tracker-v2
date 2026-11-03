// The local onboarding record (utils/onboarding/record.ts): parse, serialise, version, and no answers stored
// (Q10 included). Records saved before answers stopped being stored still parse, keeping their addedTemplateIds.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {CompleteAnswers} from '../utils/onboarding/types.ts';
import type {OnboardingRecord} from '../utils/onboarding/record.ts';

const r = await import('../utils/onboarding/record.ts');
const t = await import('../utils/onboarding/types.ts');
const st = await import('../utils/onboarding/starters.ts');

// challenge 'time', so no answer here shares a string with a Q10 value
const ANSWERS: CompleteAnswers = {
  timeBudget: 'min30', occupation: 'mid_career', habitsFeel: 'struggling', focus: ['discipline', 'health'], challenge: 'time',
  derails: 'stress', sleep: 'irregular', days: 'chaotic', values: ['peace_of_mind', 'freedom'], badHabit: null, confidence: 8,
};
const NOW = 1_762_000_000_000;

// A record as the app saved it before answers stopped being stored (age was Q1 then)
const OLD_ANSWERS = {
  age: '35_44', occupation: 'mid_career', habitsFeel: 'struggling', focus: ['discipline', 'health'], challenge: 'time',
  derails: 'stress', sleep: 'irregular', days: 'chaotic', values: ['peace_of_mind', 'freedom'], confidence: 8,
};
const OLD_RECORD = {version: 1, skipped: false, answers: OLD_ANSWERS, completedAt: NOW, addedTemplateIds: ['walk20', 'plan_top1']};

const completed = (over: Partial<OnboardingRecord> = {}): OnboardingRecord => ({...r.completedRecord(null, NOW), ...over});

describe('key and version', () => {
  test('one key per uid, version 1', () => {
    assert.equal(r.recordKey('abc123'), 'onboarding:v1:abc123');
    assert.equal(r.RECORD_VERSION, 1);
  });
});

describe('parseRecord', () => {
  test('nothing stored', () => {
    assert.deepEqual(r.parseRecord(null), {kind: 'none'});
  });

  test('a completed record round-trips', () => {
    const record = completed({addedTemplateIds: ['walk20', 'plan_top1']});
    assert.deepEqual(r.parseRecord(r.serialiseRecord(record)), {kind: 'ok', record});
  });

  test('a skip record round-trips', () => {
    const parsed = r.parseRecord(r.serialiseRecord(r.skippedRecord()));
    assert.deepEqual(parsed, {kind: 'ok', record: {version: 1, skipped: true, answers: null, completedAt: null, addedTemplateIds: []}});
  });

  test('corrupt, wrongly shaped or another version: corrupt (still a record, never re-shown)', () => {
    const good = JSON.parse(r.serialiseRecord(completed()));
    const cases = [
      '', 'not json', '[]', '42', 'null', '"x"',
      JSON.stringify({...good, version: 2}), JSON.stringify({...good, version: '1'}),
      JSON.stringify({...good, skipped: 'no'}), JSON.stringify({...good, skipped: undefined}),
      JSON.stringify({...good, completedAt: -1}), JSON.stringify({...good, completedAt: '2026-11-02'}),
      JSON.stringify({...good, addedTemplateIds: 'walk20'}),
    ];
    for (const raw of cases) assert.deepEqual(r.parseRecord(raw), {kind: 'corrupt'}, raw);
  });

  test('an old record with answers (age, no time budget) still parses: answers ignored, template ids kept', () => {
    assert.deepEqual(r.parseRecord(JSON.stringify(OLD_RECORD)), {
      kind: 'ok', record: {version: 1, skipped: false, answers: null, completedAt: NOW, addedTemplateIds: ['walk20', 'plan_top1']},
    });
    // whatever the old answers hold, even invalid or Q10, never makes the record corrupt and is never kept
    for (const answers of [{...OLD_ANSWERS, age: '12_17'}, {...OLD_ANSWERS, focus: []}, {...OLD_ANSWERS, badHabit: 'porn'}, 'x', 7]) {
      const parsed = r.parseRecord(JSON.stringify({...OLD_RECORD, answers}));
      assert.ok(parsed.kind === 'ok' && parsed.record.answers === null, JSON.stringify(answers));
    }
  });

  test('re-saving an old record drops its answers', () => {
    const parsed = r.parseRecord(JSON.stringify(OLD_RECORD));
    assert.ok(parsed.kind === 'ok');
    const json = r.serialiseRecord(parsed.record);
    assert.doesNotMatch(json, /age|35_44|mid_career|occupation/);
    assert.equal(JSON.parse(json).answers, null);
  });

  test('unknown fields and unknown or repeated template ids are dropped', () => {
    const raw = JSON.stringify({
      ...JSON.parse(r.serialiseRecord(completed())),
      extra: 1,
      addedTemplateIds: ['walk20', 'walk20', 'replace', 'smoking_vaping', 7, 'focus25'],
    });
    const parsed = r.parseRecord(raw);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.deepEqual(Object.keys(parsed.record).sort(), ['addedTemplateIds', 'answers', 'completedAt', 'skipped', 'version']);
    assert.deepEqual(parsed.record.addedTemplateIds, ['walk20', 'focus25']);
  });
});

describe('building records', () => {
  test('skip: skipped, no answers', () => {
    assert.deepEqual(r.skippedRecord(), {version: 1, skipped: true, answers: null, completedAt: null, addedTemplateIds: []});
  });

  test('a finished run stores no answers and keeps templates added before', () => {
    const previous = completed({addedTemplateIds: ['walk20']});
    assert.deepEqual(r.completedRecord(previous, NOW + 1), {
      version: 1, skipped: false, answers: null, completedAt: NOW + 1, addedTemplateIds: ['walk20'],
    });
    assert.equal(r.completedRecord(r.skippedRecord(), NOW).skipped, false);
  });

  test('withAddedTemplates: a union of catalog ids, nothing else', () => {
    const record = r.withAddedTemplates(completed({addedTemplateIds: ['walk20']}), ['walk20', 'breathe5', 'replace', 'nope']);
    assert.deepEqual(record.addedTemplateIds, ['walk20', 'breathe5']);
  });
});

describe('no answers are ever stored', () => {
  test('for every Q10 answer and time budget, the serialised record holds no answer value', () => {
    for (const badHabit of t.BAD_HABITS) {
      for (const timeBudget of t.TIME_BUDGETS) {
        const answers: CompleteAnswers = {...ANSWERS, badHabit, timeBudget};
        const picks = st.pickStarters(answers, {});
        const record = r.withAddedTemplates(r.completedRecord(null, NOW), picks.map((p) => p.id));
        const json = r.serialiseRecord(record);
        assert.doesNotMatch(json, /badHabit|timeBudget|occupation|mid_career|struggling/, badHabit);
        assert.equal(json.includes(badHabit), false, `${badHabit} in ${json}`);
        assert.equal(json.includes(timeBudget), false, `${timeBudget} in ${json}`);
        assert.equal(json.includes(st.REPLACE_PICK_ID), false, badHabit);
      }
    }
  });

  test('even a record built by hand with answers in it is serialised without them', () => {
    const tampered = completed({answers: {...ANSWERS, badHabit: 'smoking_vaping'}} as unknown as Partial<OnboardingRecord>);
    const json = r.serialiseRecord(tampered);
    assert.equal(json.includes('smoking_vaping'), false);
    assert.doesNotMatch(json, /badHabit|occupation/);
    assert.equal(JSON.parse(json).answers, null);
  });
});
