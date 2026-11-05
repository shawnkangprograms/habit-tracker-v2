// Reflections (docs/PACKS_REPORTS_SPEC.md, sections 12 and 16): the questions, the record, the offer rule, the bar
// state and the approved strings. Pure modules only.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Answers} from '../utils/reflections/questions.ts';
import type {ReflectionsRecord} from '../utils/reflections/record.ts';

const q = await import('../utils/reflections/questions.ts');
const r = await import('../utils/reflections/record.ts');
const rw = await import('../utils/reflections/rewards.ts');
const bar = await import('../utils/reflections/bar.ts');
const copy = await import('../utils/reflections/copy.ts');
const {computeGamification} = await import('../utils/gamification.ts');

const DAY = '2026-11-05';
const ANSWERS: Answers = {feel: 'ok', amount: 'all', helped: 'routine', blocker: 'none'};
const add = (record: ReflectionsRecord, habitId: string, savedAt: number, date = DAY, text = '') =>
  r.addReflection(record, {habitId, date, answers: ANSWERS, text, savedAt})!;

describe('questions', () => {
  test('the four approved questions and their tags', () => {
    assert.deepEqual(q.QUESTIONS.map((x) => [x.id, x.title, x.options.map((o) => `${o.tag}:${o.label}`)]), [
      ['feel', 'How did it feel?', ['easy:Easy', 'ok:OK', 'hard:Hard']],
      ['amount', 'How much did you do?', ['all:All of it', 'most:Most of it', 'little:A little']],
      ['helped', 'What helped most?', ['reminder:A reminder', 'routine:My routine', 'someone:Someone else', 'self:Just me']],
      ['blocker', 'Did anything get in the way?', ['none:Nothing', 'tired:Tired', 'busy:Busy', 'mood:Low mood', 'other:Other']],
    ]);
  });

  test('complete only with all four answered, each with its own tag', () => {
    assert.equal(q.isComplete(ANSWERS), true);
    assert.equal(q.isComplete({feel: 'ok', amount: 'all', helped: 'routine'}), false);
    assert.equal(q.isComplete({...ANSWERS, feel: 'tired'} as never), false);
    assert.equal(q.hasAnyAnswer({}), false);
    assert.equal(q.hasAnyAnswer({blocker: 'busy'}), true);
  });
});

describe('free text', () => {
  test('control characters go, line breaks stay, ends trimmed', () => {
    assert.equal(r.cleanText('  hi\u0007 there\nok \t'), 'hi there\nok');
  });

  test('200 characters, counted as characters (an emoji is one)', () => {
    assert.equal(r.REFLECTION_TEXT_MAX, 200);
    assert.equal(r.textError('a'.repeat(200)), null);
    assert.equal(r.textError(`  ${'a'.repeat(200)}  `), null);
    assert.equal(r.textError('a'.repeat(201)), 'tooLong');
    assert.equal(r.textError('🙂'.repeat(200)), null);
  });
});

describe('record', () => {
  test('key per user', () => {
    assert.equal(r.reflectionsKey('u1'), 'reflections:v1:u1');
  });

  test('add, find, one per habit per day, and the text kept only when not empty', () => {
    const one = add(r.emptyRecord(), 'a', 10, DAY, '  felt good  ');
    assert.deepEqual(r.findReflection(one, 'a', DAY), {...ANSWERS, text: 'felt good', savedAt: 10});
    assert.equal(r.findReflection(one, 'a', '2026-11-04'), null);
    assert.equal(r.addReflection(one, {habitId: 'a', date: DAY, answers: ANSWERS, text: '', savedAt: 11}), null);
    const two = add(one, 'b', 11);
    assert.equal('text' in r.findReflection(two, 'b', DAY)!, false);
    assert.equal(r.findReflection(one, 'b', DAY), null, 'adding never changes the old record');
  });

  test('round trip, and only what XP needs goes to the engine', () => {
    const rec = add(add(r.emptyRecord(), 'a', 10, DAY, 'private words'), 'b', 5, '2026-11-04');
    const parsed = r.parseReflections(r.serialiseReflections(rec));
    assert.equal(parsed.kind, 'ok');
    assert.deepEqual(r.recordOf(parsed), rec);
    const gami = r.toGamiReflections(rec);
    assert.deepEqual(gami.sort((x, y) => x.savedAt - y.savedAt), [
      {habitId: 'b', date: '2026-11-04', savedAt: 5}, {habitId: 'a', date: DAY, savedAt: 10},
    ]);
    assert.ok(!JSON.stringify(gami).includes('private'));
  });

  test('missing, corrupt and malformed entries', () => {
    assert.deepEqual(r.parseReflections(null), {kind: 'none'});
    assert.deepEqual(r.parseReflections('{oops'), {kind: 'corrupt'});
    assert.deepEqual(r.parseReflections('[]'), {kind: 'corrupt'});
    assert.deepEqual(r.parseReflections(JSON.stringify({version: 2, days: {}})), {kind: 'corrupt'});
    assert.deepEqual(r.recordOf({kind: 'corrupt'}), r.emptyRecord());
    const raw = JSON.stringify({version: 1, days: {
      [DAY]: {good: {...ANSWERS, savedAt: 1}, badTag: {...ANSWERS, feel: 'meh', savedAt: 2}, noTime: {...ANSWERS}},
      'not-a-date': {x: {...ANSWERS, savedAt: 3}},
    }});
    const parsed = r.parseReflections(raw);
    assert.equal(parsed.kind, 'ok');
    assert.deepEqual(Object.keys(r.recordOf(parsed).days), [DAY]);
    assert.deepEqual(Object.keys(r.recordOf(parsed).days[DAY]), ['good']);
  });
});

describe('offer and reward rule', () => {
  const ticked = (...ids: string[]) => new Set(ids);

  test('offered for a ticked habit with no reflection while fewer than 3 count', () => {
    const rec = r.emptyRecord();
    assert.equal(rw.wouldReward(rec, {habitId: 'a', date: DAY, ticked: ticked('a')}), true);
    assert.equal(rw.wouldReward(rec, {habitId: 'a', date: DAY, ticked: ticked()}), false, 'not ticked');
    const reflected = add(rec, 'a', 1);
    assert.equal(rw.wouldReward(reflected, {habitId: 'a', date: DAY, ticked: ticked('a')}), false, 'already reflected');
  });

  test('the 3-per-day cap: a fourth is not offered; another day is', () => {
    const three = add(add(add(r.emptyRecord(), 'a', 1), 'b', 2), 'c', 3);
    const all = ticked('a', 'b', 'c', 'd');
    assert.equal(rw.rewardsLeft(three, DAY, all), 0);
    assert.equal(rw.wouldReward(three, {habitId: 'd', date: DAY, ticked: all}), false);
    assert.equal(rw.wouldReward(three, {habitId: 'd', date: '2026-11-06', ticked: all}), true);
  });

  test('a reflection whose habit is un-ticked frees its place, matching the engine', () => {
    const three = add(add(add(r.emptyRecord(), 'a', 1), 'b', 2), 'c', 3);
    const withoutA = ticked('b', 'c', 'd');
    assert.equal(rw.rewardsLeft(three, DAY, withoutA), 1);
    assert.equal(rw.wouldReward(three, {habitId: 'd', date: DAY, ticked: withoutA}), true);
    // and the engine agrees: saving d now pays, so 3 rewarded
    const four = add(three, 'd', 4);
    const habits = ['a', 'b', 'c', 'd'].map((habitId) => ({habitId, createdDate: DAY, frequencyType: 'daily' as const, days: [], deleted: false}));
    const completions = [...withoutA].map((habitId) => ({habitId, date: DAY, completed: true}));
    assert.equal(computeGamification(habits, completions, DAY, r.toGamiReflections(four)).reflectionXp, 60);
  });
});

describe('the bar', () => {
  const b = {id: 1, habitId: 'a', habitName: 'Walk', date: DAY};

  test('8 s, or 20 s with a screen reader', () => {
    assert.equal(bar.barDuration(false), 8000);
    assert.equal(bar.barDuration(true), 20000);
  });

  test('removed when its habit is un-ticked; another habit\'s un-tick leaves it', () => {
    assert.equal(bar.withoutHabit(b, 'a'), null);
    assert.equal(bar.withoutHabit(b, 'z'), b);
    assert.equal(bar.withoutHabit(null, 'a'), null);
  });

  test('removed when the day changes', () => {
    assert.equal(bar.forDay(b, DAY), b);
    assert.equal(bar.forDay(b, '2026-11-06'), null);
  });

  test('its timer removes only itself: a newer bar replaced it and stays', () => {
    assert.equal(bar.expired(b, 1), null);
    const newer = {...b, id: 2, habitId: 'c'};
    assert.equal(bar.expired(newer, 1), newer);
  });
});

describe('approved strings', () => {
  test('bar', () => {
    assert.equal(copy.barText('Walk 20 minutes'), 'Walk 20 minutes done. Reflect on it?');
    assert.equal(copy.BAR_REWARD, '+20 XP');
    assert.equal(copy.BAR_BUTTON, 'Reflect');
    assert.equal(copy.barLabel('Walk'), 'Reflect on Walk for 20 XP');
    assert.equal(copy.BAR_HINT, 'Opens a short reflection');
    assert.equal(copy.barAnnouncement('Walk'), 'Walk done. Reflect on it for 20 XP from the button at the bottom of the screen.');
  });

  test('screen', () => {
    assert.equal(copy.SCREEN_TITLE, 'Reflect');
    assert.equal(copy.SCREEN_BACK, 'Home');
    assert.equal(copy.SCREEN_INTRO, 'Four quick taps.');
    assert.equal(copy.TEXT_LABEL, 'ANYTHING ELSE? (OPTIONAL)');
    assert.equal(copy.TEXT_PLACEHOLDER, 'A few words for yourself');
    assert.equal(copy.textCounter(12, 200), '12/200');
    assert.equal(copy.TEXT_TOO_LONG, 'Use 200 characters or fewer.');
    assert.equal(copy.REWARD_LINE, '+20 XP for answering the four questions.');
    assert.equal(copy.NO_REWARD_LINE, "This one won't earn XP today.");
    assert.equal(copy.SAVE_BUTTON, 'Save reflection');
    assert.equal(copy.SAVE_HINT_DISABLED, 'Answer the four questions to save.');
    assert.deepEqual([copy.DISCARD_TITLE, copy.DISCARD_BODY, copy.DISCARD_CONFIRM, copy.DISCARD_CANCEL],
      ['Discard this reflection?', "Your answers won't be saved.", 'Discard', 'Keep editing']);
    assert.deepEqual([copy.SAVE_FAILED_TITLE, copy.SAVE_FAILED_BODY], ["Couldn't save reflection", 'Something went wrong. Please try again.']);
    assert.deepEqual([copy.ALREADY_TITLE, copy.ALREADY_BODY], ['Already reflected', "You've already reflected on this habit today."]);
  });

  test('Home toast', () => {
    assert.deepEqual([...copy.SAVED_REWARDED], ['Reflection saved. +20 XP.', 'Saved. +20 XP for reflecting.']);
    assert.equal(copy.SAVED_PLAIN, 'Reflection saved.');
  });
});
