// Habit Profile scoring (utils/onboarding/scoring.ts), case by case from docs/ONBOARDING_SPEC.md section 3.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Axis} from '../utils/onboarding/types.ts';
import type {ScoringInput, Scores} from '../utils/onboarding/scoring.ts';

const s = await import('../utils/onboarding/scoring.ts');

// Scores only Career (focus +2, not a student +1): Career 4, every other axis 1
const BASE: ScoringInput = {
  occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus', derails: 'boredom',
  sleep: 'good', days: 'predictable', values: ['freedom'],
};

// What changing these fields does to each axis, compared with BASE (axes that don't change are left out)
function delta(over: Partial<ScoringInput>): Partial<Scores> {
  const before = s.scoreAxes(BASE);
  const after = s.scoreAxes({...BASE, ...over});
  const out: Partial<Scores> = {};
  for (const axis of Object.keys(after) as Axis[]) if (after[axis] !== before[axis]) out[axis] = after[axis] - before[axis];
  return out;
}

describe('scoreAxes', () => {
  test('every axis starts at 1', () => {
    assert.deepEqual(s.scoreAxes(BASE), {Learning: 1, Mind: 1, Career: 4, Discipline: 1, Relations: 1, Health: 1});
  });

  test('Health', () => {
    assert.deepEqual(delta({focus: ['career', 'health']}), {Health: 2});
    assert.deepEqual(delta({values: ['health_energy']}), {Health: 1});
    assert.deepEqual(delta({sleep: 'struggle'}), {Health: 1});
    assert.deepEqual(delta({sleep: 'irregular'}), {Health: 1});
    assert.deepEqual(delta({sleep: 'okay'}), {});
    assert.deepEqual(delta({challenge: 'low_energy'}), {Health: 1});
  });

  test('Mind', () => {
    assert.deepEqual(delta({focus: ['career', 'mental']}), {Mind: 2});
    assert.deepEqual(delta({values: ['peace_of_mind']}), {Mind: 1});
    assert.deepEqual(delta({habitsFeel: 'overwhelmed'}), {Mind: 1, Discipline: 1});
    assert.deepEqual(delta({derails: 'stress'}), {Mind: 1});
  });

  test('Discipline', () => {
    assert.deepEqual(delta({focus: ['career', 'discipline']}), {Discipline: 2});
    assert.deepEqual(delta({challenge: 'procrastination'}), {Discipline: 1});
    assert.deepEqual(delta({derails: 'low_motivation'}), {Discipline: 1});
    assert.deepEqual(delta({habitsFeel: 'struggling'}), {Discipline: 1});
    assert.deepEqual(delta({habitsFeel: 'alright'}), {});
    assert.deepEqual(delta({days: 'chaotic'}), {Discipline: 1});
  });

  test('Career', () => {
    assert.deepEqual(s.scoreAxes({...BASE, focus: ['health']}).Career, 2);// not a student only
    assert.deepEqual(delta({values: ['achievement']}), {Career: 1});
    assert.deepEqual(delta({challenge: 'time'}), {Career: 1});
    assert.deepEqual(delta({challenge: 'balance'}), {Career: 1});
  });

  test('Learning: student +1, student-only challenges +1, procrastination does not count', () => {
    assert.deepEqual(delta({focus: ['career', 'education']}), {Learning: 2});
    assert.deepEqual(delta({occupation: 'student'}), {Career: -1, Learning: 1});
    for (const challenge of ['study_focus', 'overwhelmed', 'memory', 'study_motivation'] as const) {
      assert.deepEqual(delta({occupation: 'student', challenge}), {Career: -1, Learning: 2}, challenge);
    }
    assert.deepEqual(delta({occupation: 'student', challenge: 'procrastination'}), {Career: -1, Learning: 1, Discipline: 1});
  });

  test('Relations', () => {
    assert.deepEqual(delta({focus: ['career', 'relationships']}), {Relations: 2});
    assert.deepEqual(delta({values: ['connection']}), {Relations: 1});
    assert.deepEqual(delta({derails: 'social_pressure'}), {Relations: 1});
  });

  test('capped at 5', () => {
    const scores = s.scoreAxes({
      ...BASE, focus: ['discipline'], challenge: 'procrastination', derails: 'low_motivation',
      habitsFeel: 'overwhelmed', days: 'chaotic',
    });
    assert.equal(scores.Discipline, 5);// 1 + 2 + 1 + 1 + 1 + 1 = 7
    assert.equal(s.scoreAxes({...BASE, values: ['achievement'], challenge: 'time'}).Career, 5);// 6
  });

  test('the radar plots score / 5, baseline 2', () => {
    assert.deepEqual(s.radarValues(s.scoreAxes(BASE)), [0.2, 0.2, 0.8, 0.2, 0.2, 0.2]);
    assert.equal(s.RADAR_BASELINE, 2);
  });
});

describe('focus axis and ties', () => {
  test('the highest score wins', () => {
    assert.equal(s.focusAxis(s.scoreAxes(BASE), BASE.focus), 'Career');
  });

  test('a tie between Q4 picks goes to the one picked first', () => {
    const a = {...BASE, focus: ['mental', 'health'] as ScoringInput['focus']};
    assert.equal(s.focusAxis(s.scoreAxes(a), a.focus), 'Mind');
    const b = {...BASE, focus: ['health', 'mental'] as ScoringInput['focus']};
    assert.equal(s.focusAxis(s.scoreAxes(b), b.focus), 'Health');
  });

  test('a Q4 pick beats the fixed order', () => {
    // Relations 3 (picked), Discipline 3 (not picked, but first in the fixed order)
    const a: ScoringInput = {...BASE, focus: ['relationships'], challenge: 'procrastination', derails: 'low_motivation'};
    const scores = s.scoreAxes(a);
    assert.equal(scores.Relations, 3);
    assert.equal(scores.Discipline, 3);
    assert.equal(s.focusAxis(scores, a.focus), 'Relations');
  });

  test('a tie with no Q4 pick uses the fixed order: Discipline, Health, Mind, Career, Learning, Relations', () => {
    // Discipline 4 and Mind 4, neither picked; Relations 3 (picked)
    const a: ScoringInput = {
      ...BASE, focus: ['relationships'], habitsFeel: 'overwhelmed', days: 'chaotic', challenge: 'procrastination',
      derails: 'stress', values: ['peace_of_mind'],
    };
    const scores = s.scoreAxes(a);
    assert.equal(scores.Discipline, 4);
    assert.equal(scores.Mind, 4);
    assert.equal(s.focusAxis(scores, a.focus), 'Discipline');
  });

  test('rankAxes orders every axis: score, then Q4 order, then the fixed order', () => {
    // Relations 3 (picked); Health, Mind and Career 2; Discipline and Learning 1
    const a: ScoringInput = {...BASE, focus: ['relationships'], values: ['health_energy'], derails: 'stress'};
    assert.deepEqual(s.rankAxes(s.scoreAxes(a), a.focus), ['Relations', 'Health', 'Mind', 'Career', 'Discipline', 'Learning']);
  });
});
