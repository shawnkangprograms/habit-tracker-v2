// The local onboarding record (utils/onboarding/record.ts): parse, serialise, version, and Q10 never stored.
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
  age: '35_44', occupation: 'mid_career', habitsFeel: 'struggling', focus: ['discipline', 'health'], challenge: 'time',
  derails: 'stress', sleep: 'irregular', days: 'chaotic', values: ['peace_of_mind', 'freedom'], badHabit: null, confidence: 8,
};
const {badHabit: _none, ...STORED} = ANSWERS;
const NOW = 1_762_000_000_000;

const completed = (over: Partial<OnboardingRecord> = {}): OnboardingRecord =>
  ({...r.completedRecord(null, ANSWERS, NOW), ...over});

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
      JSON.stringify({...good, answers: {...STORED, age: '12_17'}}),
      JSON.stringify({...good, answers: {...STORED, focus: []}}),
    ];
    for (const raw of cases) assert.deepEqual(r.parseRecord(raw), {kind: 'corrupt'}, raw);
  });

  test('unknown fields, unknown or repeated template ids, and a stored Q10 are dropped', () => {
    const raw = JSON.stringify({
      ...JSON.parse(r.serialiseRecord(completed())),
      extra: 1,
      answers: {...STORED, badHabit: 'porn'},
      addedTemplateIds: ['walk20', 'walk20', 'replace', 'smoking_vaping', 7, 'focus25'],
    });
    const parsed = r.parseRecord(raw);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.deepEqual(Object.keys(parsed.record).sort(), ['addedTemplateIds', 'answers', 'completedAt', 'skipped', 'version']);
    assert.deepEqual(parsed.record.answers, STORED);
    assert.deepEqual(parsed.record.addedTemplateIds, ['walk20', 'focus25']);
  });
});

describe('building records', () => {
  test('skip: skipped, no answers', () => {
    assert.deepEqual(r.skippedRecord(), {version: 1, skipped: true, answers: null, completedAt: null, addedTemplateIds: []});
  });

  test('a finished run stores the answers without Q10 and keeps templates added before', () => {
    const previous = completed({addedTemplateIds: ['walk20']});
    const next = r.completedRecord(previous, {...ANSWERS, badHabit: 'alcohol', confidence: 3}, NOW + 1);
    assert.deepEqual(next, {
      version: 1, skipped: false, answers: {...STORED, confidence: 3}, completedAt: NOW + 1, addedTemplateIds: ['walk20'],
    });
    assert.equal(r.completedRecord(r.skippedRecord(), ANSWERS, NOW).skipped, false);
  });

  test('withAddedTemplates: a union of catalog ids, nothing else', () => {
    const record = r.withAddedTemplates(completed({addedTemplateIds: ['walk20']}), ['walk20', 'breathe5', 'replace', 'nope']);
    assert.deepEqual(record.addedTemplateIds, ['walk20', 'breathe5']);
  });
});

describe('Q10 is never stored', () => {
  test('for every Q10 answer, the serialised record has no Q10 field and no Q10 value', () => {
    for (const badHabit of t.BAD_HABITS) {
      const answers: CompleteAnswers = {...ANSWERS, badHabit};
      const picks = st.pickStarters(answers, {});
      let record = r.completedRecord(null, answers, NOW);
      record = r.withAddedTemplates(record, picks.map((p) => p.id));
      const json = r.serialiseRecord(record);
      assert.doesNotMatch(json, /badHabit/, badHabit);
      assert.equal(json.includes(badHabit), false, `${badHabit} in ${json}`);
      assert.equal(json.includes(st.REPLACE_PICK_ID), false, badHabit);
    }
  });

  test('even a record built by hand with Q10 in its answers is serialised without it', () => {
    const tampered = completed({answers: {...STORED, badHabit: 'smoking_vaping'} as unknown as OnboardingRecord['answers']});
    const json = r.serialiseRecord(tampered);
    assert.equal(json.includes('smoking_vaping'), false);
    assert.doesNotMatch(json, /badHabit/);
  });
});
