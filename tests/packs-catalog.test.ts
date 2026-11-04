// The 24-template catalog and the six built-in packs (utils/packs/builtin.ts, utils/onboarding/starters.ts), the
// pack choice after onboarding (utils/packs/choose.ts), and the limits by level (utils/packs/limits.ts), each
// checked against docs/PACKS_REPORTS_SPEC.md (sections 1, 2b and 3).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {CompleteAnswers} from '../utils/onboarding/types.ts';

const b = await import('../utils/packs/builtin.ts');
const pc = await import('../utils/packs/copy.ts');
const ch = await import('../utils/packs/choose.ts');
const lim = await import('../utils/packs/limits.ts');
const st = await import('../utils/onboarding/starters.ts');
const t = await import('../utils/onboarding/types.ts');
const c = await import('../utils/onboarding/copy.ts');
const sc = await import('../utils/onboarding/scoring.ts');

const SPEC = readFileSync(new URL('../docs/PACKS_REPORTS_SPEC.md', import.meta.url), 'utf8');

function section(doc: string, prefix: string): string {
  const found = doc.split(/\r?\n(?=## )/).find((p) => p.startsWith(`## ${prefix}`));
  assert.ok(found, `section "${prefix}" not found`);
  return found;
}

// Each table's body rows (header and separator dropped), cells trimmed
function tables(text: string): string[][][] {
  const out: string[][][] = [];
  let rows: string[] | null = null;
  const flush = () => {
    if (rows) out.push(rows.slice(2).map((row) => row.trim().slice(1, -1).split('|').map((cell) => cell.trim())));
    rows = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) (rows ??= []).push(line);
    else flush();
  }
  flush();
  return out;
}

describe('catalog and built-in packs', () => {
  test('24 templates, each in exactly one pack; six packs of four', () => {
    assert.equal(t.TEMPLATE_IDS.length, 24);
    assert.equal(b.BUILTIN_PACKS.length, 6);
    const all = b.BUILTIN_PACKS.flatMap((p) => p.templates);
    assert.deepEqual([...all].sort(), [...t.TEMPLATE_IDS].sort());
    for (const pack of b.BUILTIN_PACKS) assert.equal(pack.templates.length, 4, pack.id);
    for (const id of t.TEMPLATE_IDS) assert.equal(b.BUILTIN_PACKS.filter((p) => p.templates.includes(id)).length, 1, id);
  });

  test('every template has exactly one area, and it is its pack\'s area', () => {
    for (const tpl of st.CATALOG) assert.equal(tpl.area, b.builtinPack(b.packOfTemplate(tpl.id)).area, tpl.id);
    assert.deepEqual([...new Set(b.BUILTIN_PACKS.map((p) => p.area))].sort(), [...t.AXES].sort());
  });

  test('the area differs from the onboarding axis for exactly lights_out, screens_off and focus25', () => {
    const differ = st.CATALOG.filter((tpl) => tpl.area !== tpl.axis).map((tpl) => [tpl.id, tpl.axis, tpl.area]);
    assert.deepEqual(differ, [['lights_out', 'Health', 'Mind'], ['screens_off', 'Health', 'Mind'], ['focus25', 'Discipline', 'Career']]);
  });

  test('the ten new templates: approved names, reasons, icons and minutes', () => {
    const fresh = st.CATALOG.slice(14).map((tpl) => [tpl.id, tpl.habitName, tpl.reason, tpl.icon, tpl.minutes]);
    assert.deepEqual(fresh, [
      ['eat_produce', 'Eat one fruit or vegetable', 'One small swap that adds up over a week.', 'food', 1],
      ['make_bed', 'Make your bed', 'A finished task before the day even starts.', 'sleep', 2],
      ['tidy5', 'Tidy your space for 5 minutes', 'A clear space makes starting easier.', 'star', 5],
      ['set_out_essentials', "Set out tomorrow's essentials", 'Fewer decisions in the morning rush.', 'work', 5],
      ['work_win', 'Track one work win', 'Small wins are easy to forget. Write one down.', 'star', 2],
      ['reach_out', 'Reach out to one contact', 'One message keeps your network warm.', 'work', 5],
      ['read15', 'Read for 15 minutes', 'A few pages a day add up to books a year.', 'book', 15],
      ['teach_back', 'Teach what you learned', 'Explaining it is the fastest way to remember.', 'study', 5],
      ['thank_someone', 'Thank someone today', 'Saying thanks out loud lifts you both.', 'heart', 1],
      ['kind_act', 'Do one kind thing', 'Small kindness builds closer ties.', 'heart', 5],
    ]);
  });

  test('matches the spec table (section 1): pack ids, names, areas and templates in card order', () => {
    const [rows] = tables(section(SPEC, '1.'));
    const byName = new Map(st.CATALOG.map((tpl) => [tpl.habitName, tpl.id]));
    const fromDoc = rows.map(([id, name, area, templates]) => [
      id, name, area, templates.split(', ').map((cell) => {
        const bold = /^\*\*(.+)\*\*$/.exec(cell);
        return bold ? byName.get(bold[1]) : cell;
      }),
    ]);
    assert.deepEqual(fromDoc, b.BUILTIN_PACKS.map((p) => [p.id, pc.PACK_NAMES[p.id], p.area, [...p.templates]]));
  });

  test('pack names fit the pack name rule', async () => {
    const {validatePackName} = await import('../utils/packs/record.ts');
    for (const name of Object.values(pc.PACK_NAMES)) assert.deepEqual(validatePackName(name), {valid: true, value: name});
    assert.deepEqual(Object.keys(pc.PACK_NAMES), [...b.BUILTIN_PACK_IDS]);
  });

  test('template names and reasons: every id has one (the onboarding copy tests check the limits)', () => {
    assert.deepEqual(Object.keys(c.TEMPLATE_NAMES), [...t.TEMPLATE_IDS]);
    assert.deepEqual(Object.keys(c.TEMPLATE_REASONS), [...t.TEMPLATE_IDS]);
  });
});

describe('choosing the two packs after onboarding', () => {
  const BASE: CompleteAnswers = {
    timeBudget: 'min60', occupation: 'early_career', habitsFeel: 'thriving', focus: ['career'], challenge: 'focus',
    derails: 'boredom', sleep: 'good', days: 'predictable', values: ['freedom'], badHabit: null, confidence: 5,
  };
  const scoresWith = (over: Partial<Record<string, number>>) => ({
    Learning: 1, Mind: 1, Career: 1, Discipline: 1, Relations: 1, Health: 1, ...over,
  });

  test('the focus axis\'s pack first, then the highest remaining score', () => {
    assert.deepEqual(ch.chooseOnboardingPacks(scoresWith({Career: 4, Relations: 3}), ['career']), ['career_builder', 'close_circle']);
    assert.deepEqual(ch.chooseOnboardingPacks(scoresWith({Learning: 5, Mind: 2}), ['education']), ['study_sprint', 'calm_mind']);
  });

  test('ties for the second pack: Health, Mind, Discipline, Career, Learning, Relations', () => {
    assert.deepEqual(ch.PACK_TIE_ORDER, ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations']);
    assert.deepEqual(ch.chooseOnboardingPacks(scoresWith({Career: 3}), ['career']), ['career_builder', 'steady_energy']);
    assert.deepEqual(ch.chooseOnboardingPacks(scoresWith({Health: 3}), ['health']), ['steady_energy', 'calm_mind']);
    assert.deepEqual(ch.chooseOnboardingPacks(scoresWith({Relations: 3, Learning: 2, Discipline: 2}), ['relationships']),
      ['close_circle', 'daily_discipline']);
  });

  test('the first pack is always the Habit Profile\'s focus axis, and the two are different', () => {
    for (const area of t.FOCUS_AREAS) {
      for (const occupation of t.OCCUPATIONS) {
        for (const derails of t.DERAILS) {
          const a: CompleteAnswers = {...BASE, focus: [area], occupation, derails};
          const scores = sc.scoreAxes(a);
          const [first, second] = ch.chooseOnboardingPacks(scores, a.focus);
          assert.equal(b.builtinPack(first).area, sc.focusAxis(scores, a.focus));
          assert.notEqual(first, second);
        }
      }
    }
  });
});

describe('limits by level', () => {
  test('match the spec table (section 2b) for levels 1 to 10', () => {
    const [table] = tables(section(SPEC, '2b.'));
    const [habits, packs] = table;
    assert.equal(habits[0], 'Habits');
    assert.equal(packs[0], 'Packs');
    for (let level = 1; level <= 10; level++) {
      assert.deepEqual(lim.limitsForLevel(level), {habits: Number(habits[level]), packs: Number(packs[level])}, String(level));
    }
  });

  test('12 habits at level 1: two packs (8) and up to 5 starters fit in a first session', () => {
    assert.ok(lim.limitsForLevel(1).habits >= 8 + st.MAX_STARTERS - 1);
    assert.equal(lim.limitsForLevel(1).packs, 2);
  });

  test('the next level with a higher limit (the {x} in the message)', () => {
    assert.equal(lim.nextLimitLevel(1, 'habits'), 2);
    assert.equal(lim.nextLimitLevel(7, 'habits'), 8);
    assert.equal(lim.nextLimitLevel(1, 'packs'), 3);
    assert.equal(lim.nextLimitLevel(2, 'packs'), 3);
    assert.equal(lim.nextLimitLevel(3, 'packs'), 5);
    for (let level = 1; level <= 40; level++) {
      for (const kind of ['habits', 'packs'] as const) {
        const next = lim.nextLimitLevel(level, kind);
        assert.ok(lim.limitsForLevel(next)[kind] > lim.limitsForLevel(level)[kind]);
        assert.equal(lim.limitsForLevel(next - 1)[kind], lim.limitsForLevel(level)[kind]);
      }
    }
  });

  test('room: what is left; a user above the limit keeps everything and has none', () => {
    assert.equal(lim.roomFor(1, 'habits', 5), 7);
    assert.equal(lim.roomFor(1, 'habits', 12), 0);
    assert.equal(lim.roomFor(1, 'habits', 30), 0);
    assert.equal(lim.roomFor(3, 'packs', 1), 2);
  });

  test('an odd level reads as the nearest real one at or below it (never below 1)', () => {
    assert.deepEqual(lim.limitsForLevel(0), lim.limitsForLevel(1));
    assert.deepEqual(lim.limitsForLevel(Number.NaN), lim.limitsForLevel(1));
    assert.deepEqual(lim.limitsForLevel(2.7), lim.limitsForLevel(2));
  });

  test('the limit messages are the spec\'s', () => {
    const text = section(SPEC, '2b.');
    assert.ok(text.includes(`"${pc.habitLimitMessage(9).replace('9', '{x}')}"`));
    assert.ok(text.includes(`"${pc.packLimitMessage(9).replace('9', '{x}')}"`));
    assert.equal(pc.habitLimitMessage(2), 'Habit limit reached. Reach level 2 to add more habits.');
    assert.equal(pc.packLimitMessage(3), 'Pack limit reached. Reach level 3 to add more habit packs.');
  });
});
