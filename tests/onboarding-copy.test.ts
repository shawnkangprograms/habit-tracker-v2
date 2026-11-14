// Onboarding copy (utils/onboarding/copy.ts): every enum value has a line, every line fits its limit, and every
// table matches docs/ONBOARDING_COPY.md and docs/ONBOARDING_SPEC.md exactly (so the code and the docs can't drift).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below

const c = await import('../utils/onboarding/copy.ts');
const t = await import('../utils/onboarding/types.ts');
const f = await import('../utils/onboarding/flow.ts');
const st = await import('../utils/onboarding/starters.ts');
const {validateHabitName} = await import('../validation/validators.ts');

const COPY_DOC = readFileSync(new URL('../docs/ONBOARDING_COPY.md', import.meta.url), 'utf8');
const SPEC_DOC = readFileSync(new URL('../docs/ONBOARDING_SPEC.md', import.meta.url), 'utf8');

// Lengths in code points, as validateHabitName counts them
const len = (s: string) => Array.from(s).length;

function assertMax(lines: Record<string, string> | string[], max: number, what: string) {
  for (const [key, line] of Object.entries(lines)) {
    assert.ok(line.trim().length > 0, `${what} ${key} is empty`);
    assert.ok(len(line) <= max, `${what} ${key} is ${len(line)} characters (max ${max}): ${line}`);
  }
}

// ---------- Markdown helpers ----------

// The text of the "## <prefix>..." section, up to the next "## "
function section(doc: string, prefix: string): string {
  const parts = doc.split(/\r?\n(?=## )/);
  const found = parts.find((p) => p.startsWith(`## ${prefix}`));
  assert.ok(found, `section "${prefix}" not found`);
  return found;
}

// Each table in the text as its body rows (header and separator dropped), cells trimmed
function tables(text: string): string[][][] {
  const out: string[][][] = [];
  let rows: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) (rows ??= []).push(line);
    else if (rows) { out.push(toCells(rows)); rows = null; }
  }
  if (rows) out.push(toCells(rows));
  return out;
}

function toCells(rows: string[]): string[][] {
  return rows.slice(2).map((row) => row.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
}

const toRecord = (rows: string[][], value = 1) => Object.fromEntries(rows.map((row) => [row[0], row[value]]));

// ---------- Coverage and limits ----------

describe('every enum value has a line', () => {
  test('option labels: one per value, in the enum order', () => {
    const lists: [Record<string, string>, readonly string[]][] = [
      [c.TIME_BUDGET_LABELS, t.TIME_BUDGETS], [c.OCCUPATION_LABELS, t.OCCUPATIONS], [c.HABITS_FEEL_LABELS, t.HABITS_FEEL],
      [c.FOCUS_LABELS, t.FOCUS_AREAS], [c.CHALLENGE_LABELS, t.CHALLENGES], [c.DERAIL_LABELS, t.DERAILS],
      [c.SLEEP_LABELS, t.SLEEP], [c.DAYS_LABELS, t.DAYS], [c.VALUE_LABELS, t.VALUES], [c.BAD_HABIT_LABELS, t.BAD_HABITS],
    ];
    for (const [labels, values] of lists) assert.deepEqual(Object.keys(labels), [...values]);
  });

  test('a title for every step, and the reflection, reason, replace, focus and day-1 tables are complete', () => {
    assert.deepEqual(Object.keys(c.STEP_TITLES), [...f.STEPS]);
    assert.deepEqual(Object.keys(c.CHALLENGE_LINES).sort(), [...t.CHALLENGES].sort());
    assert.deepEqual(Object.keys(c.RHYTHM_LINES), [...t.DAYS]);
    assert.deepEqual(Object.keys(c.DERAIL_LINES), [...t.DERAILS]);
    assert.deepEqual(Object.keys(c.TEMPLATE_NAMES), [...t.TEMPLATE_IDS]);
    assert.deepEqual(Object.keys(c.TEMPLATE_REASONS), [...t.TEMPLATE_IDS]);
    assert.deepEqual(Object.keys(c.REPLACE_NAMES), [...t.REPLACE_ANSWERS]);
    assert.deepEqual(Object.keys(c.REPLACE_REASONS), [...t.REPLACE_ANSWERS]);
    assert.deepEqual(Object.keys(c.FOCUS_CARDS).sort(), [...t.AXES].sort());
    assert.deepEqual(Object.keys(c.DAY1_MOVES).sort(), [...t.AXES].sort());
    for (const axis of t.AXES) assert.deepEqual(c.DAY1_MOVES[axis].map((m) => m.when), ['Tonight', 'Tomorrow', 'This week']);
  });
});

describe('length limits', () => {
  test('habit names: 30 characters or fewer, and accepted by validateHabitName unchanged', () => {
    for (const name of [...Object.values(c.TEMPLATE_NAMES), ...Object.values(c.REPLACE_NAMES)]) {
      assert.ok(len(name) <= 30, `${name} is ${len(name)} characters`);
      assert.deepEqual(validateHabitName(name), {valid: true, value: name});
    }
    assert.equal(new Set(Object.values(c.TEMPLATE_NAMES)).size, t.TEMPLATE_IDS.length);
  });

  test('reflections and reasons 60, focus subtitles 90, day-1 titles 32 and lines 40, quotes 70', () => {
    assertMax(c.CHALLENGE_LINES, 60, 'challenge');
    assertMax(c.RHYTHM_LINES, 60, 'rhythm');
    assertMax(c.DERAIL_LINES, 60, 'derails');
    assertMax(c.TEMPLATE_REASONS, 60, 'reason');
    assertMax(c.REPLACE_REASONS, 60, 'replace reason');
    assertMax(Object.fromEntries(t.AXES.map((a) => [a, c.FOCUS_CARDS[a].subtitle])), 90, 'focus subtitle');
    for (const axis of t.AXES) {
      assertMax(c.DAY1_MOVES[axis].map((m) => m.title), 32, `${axis} day-1 title`);
      assertMax(c.DAY1_MOVES[axis].map((m) => m.line), 40, `${axis} day-1 line`);
    }
    assertMax(c.QUOTES.flatMap((q) => (q.english ? [q.text, q.english] : [q.text])), 70, 'quote');
  });
});

// ---------- Docs parity ----------

describe('matches docs/ONBOARDING_COPY.md', () => {
  test('"What you told us": card labels and the three line tables', () => {
    const text = section(COPY_DOC, '1.');
    const [challenge, rhythm, derails] = tables(text);
    assert.deepEqual(toRecord(challenge), c.CHALLENGE_LINES);
    assert.deepEqual(toRecord(rhythm), c.RHYTHM_LINES);
    assert.deepEqual(toRecord(derails), c.DERAIL_LINES);
    for (const label of [c.CHALLENGE_CARD_LABEL, c.RHYTHM_CARD_LABEL, c.DERAILS_CARD_LABEL]) assert.ok(text.includes(`"${label}"`), label);
  });

  test('habit reasons and the replace habits', () => {
    const [reasons, replace] = tables(section(COPY_DOC, '2.'));
    assert.deepEqual(toRecord(reasons), c.TEMPLATE_REASONS);
    assert.deepEqual(toRecord(replace, 1), c.REPLACE_NAMES);
    assert.deepEqual(toRecord(replace, 2), c.REPLACE_REASONS);
  });

  test('focus cards', () => {
    const [rows] = tables(section(COPY_DOC, '3.'));
    assert.deepEqual(
      Object.fromEntries(rows.map(([axis, displayName, subtitle]) => [axis, {displayName, subtitle}])),
      c.FOCUS_CARDS,
    );
    assert.equal(c.focusTitle('Mind'), 'Your plan will focus on Mind & Calm');
  });

  test('Building Profile: title, rows and status words', () => {
    const text = section(COPY_DOC, '4.');
    assert.ok(text.includes(`Title: "${c.BUILDING_TITLE}"`));
    const rowsLine = text.split(/\r?\n/).find((l) => l.startsWith('Checklist rows'))!;
    assert.deepEqual([...rowsLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]), [...c.BUILDING_ROWS]);
    assert.ok(text.includes('0 to 89% "BUILDING", 90 to 99% "ALMOST THERE", 100% "READY"'));
    const expected: [number, string][] = [[0, 'BUILDING'], [89, 'BUILDING'], [90, 'ALMOST THERE'], [99, 'ALMOST THERE'], [100, 'READY']];
    for (const [percent, word] of expected) assert.equal(c.statusWord(percent), word, String(percent));
  });

  test('day-1 moves', () => {
    const [rows] = tables(section(COPY_DOC, '5.'));
    const fromDoc = rows.map(([axis, when, title, line]) => ({axis, when, title, line}));
    const fromCode = t.AXES.flatMap((axis) => c.DAY1_MOVES[axis].map((m) => ({axis, ...m})));
    const order = (list: {axis: string}[]) => [...list].sort((a, b) => a.axis.localeCompare(b.axis));
    assert.deepEqual(order(fromCode), order(fromDoc));
  });

  test('loading quotes: the one-liners in order, then the proverbs with their English lines', () => {
    const text = section(COPY_DOC, '6.');
    const oneLiners = text.split(/\r?\n/).flatMap((l) => /^\d+\. (.+)$/.exec(l)?.[1] ?? []);
    const [proverbs] = tables(text);
    assert.deepEqual(c.QUOTES, [
      ...oneLiners.map((text) => ({text})),
      ...proverbs.map(([text, english]) => ({text, english})),
    ]);
    assert.equal(new Set(c.QUOTES.map((q) => q.text)).size, c.QUOTES.length);
  });
});

describe('matches docs/ONBOARDING_COPY.md section 7', () => {
  test('result screen strings: the doc table and copy.ts hold the same constants with the same text', () => {
    const [rows] = tables(section(COPY_DOC, '7.'));
    const fromCode = {
      TOLD_US_TITLE: c.TOLD_US_TITLE, DAY1_TITLE: c.DAY1_TITLE, PROFILE_TITLE: c.PROFILE_TITLE,
      ROUTINE_TITLE: c.ROUTINE_TITLE, ROUTINE_HINT: c.ROUTINE_HINT, ROUTINE_REMINDER_LABEL: c.ROUTINE_REMINDER_LABEL,
      DONE: c.DONE, ADDED: c.ADDED, OWN_HABIT_REASON: c.OWN_HABIT_REASON, NOTHING_LEFT: c.NOTHING_LEFT,
      CREATE_FAILED: c.CREATE_FAILED, ROUTINE_OTHER_GROUP: c.ROUTINE_OTHER_GROUP,
      SKIP_TITLE: c.SKIP_TITLE, SKIP_BODY: c.SKIP_BODY, SKIP_YES: c.SKIP_YES, SKIP_NO: c.SKIP_NO,
      LEAVE_TITLE: c.LEAVE_TITLE, LEAVE_BODY: c.LEAVE_BODY, LEAVE_YES: c.LEAVE_YES, LEAVE_NO: c.LEAVE_NO,
      LEAVING_NOTICE: c.LEAVING_NOTICE, GO_HOME: c.GO_HOME,
      RETAKE_LEAVING_NOTICE: c.RETAKE_LEAVING_NOTICE, BACK_TO_SETTINGS: c.BACK_TO_SETTINGS,
    };
    assert.deepEqual(toRecord(rows), fromCode);
    // every row names a real export holding exactly that text
    for (const [name, text] of rows) assert.equal((c as Record<string, unknown>)[name], text, name);
  });

  test('the routine subtitle', () => {
    assert.ok(section(COPY_DOC, '7.').includes(`"${c.routineSubtitle('{pack A}', '{pack B}')}"`));
    assert.equal(c.routineSubtitle('Steady Energy', 'Calm Mind'), 'Built from your packs: Steady Energy and Calm Mind.');
  });

  test('"Add your own habit" and "Start" come from the spec', () => {
    assert.ok(section(SPEC_DOC, '5.').includes(`"${c.ADD_OWN_HABIT}" and "${c.START}"`));
  });
});

describe('matches docs/ONBOARDING_SPEC.md', () => {
  test('catalog ids, axes, areas, names and minutes in order (section 4)', () => {
    const [rows] = tables(section(SPEC_DOC, '4.'));
    assert.deepEqual(rows, st.CATALOG.map((tpl) => [tpl.id, tpl.axis, tpl.area, tpl.habitName, String(tpl.minutes)]));
  });

  test('replace habit minutes and the time budget caps (section 4)', () => {
    const text = section(SPEC_DOC, '4.');
    const line = text.split(/\r?\n/).find((l) => l.startsWith('Replace habit minutes:'))!;
    const minutes = Object.fromEntries([...line.matchAll(/(\w+) (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    assert.deepEqual(minutes, st.REPLACE_MINUTES);
    const [, caps] = tables(text);
    const cap = (n: number) => (Number.isFinite(n) ? String(n) : 'no cap');
    assert.deepEqual(caps, t.TIME_BUDGETS.map((b) => [b, cap(st.BUDGET_CAPS[b].single), cap(st.BUDGET_CAPS[b].total)]));
  });

  test('replace habit names (section 4)', () => {
    const line = section(SPEC_DOC, '4.').split(/\r?\n/).find((l) => l.startsWith('phone_social:'))!;
    const names = Object.fromEntries([...line.matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(names, c.REPLACE_NAMES);
  });

  test('first-step notice and progress line (section 1)', () => {
    assert.ok(section(SPEC_DOC, '1.').includes(`"${c.FIRST_STEP_NOTICE}"`));
    assert.ok(section(SPEC_DOC, '1.').includes('Progress reads "STEP n OF 11"'));
    assert.equal(c.stepLabel(3, f.STEP_COUNT), 'STEP 3 OF 11');
  });

  test('Back and Continue (section 8)', () => {
    const text = section(SPEC_DOC, '8.');
    assert.ok(text.includes(`"${c.BACK}" top left`));
    assert.ok(text.includes(`"${c.CONTINUE}" button`));
  });

  test('titles, hints and option labels per step (section 8)', () => {
    const [rows] = tables(section(SPEC_DOC, '8.'));
    const byStep = new Map(rows.map(([step, title, hint, options]) => [step, {title, hint, options}]));
    const labelsFor: Record<string, Record<string, string>> = {
      timeBudget: c.TIME_BUDGET_LABELS, occupation: c.OCCUPATION_LABELS, habitsFeel: c.HABITS_FEEL_LABELS, focus: c.FOCUS_LABELS,
      derails: c.DERAIL_LABELS, sleep: c.SLEEP_LABELS, days: c.DAYS_LABELS, values: c.VALUE_LABELS, badHabit: c.BAD_HABIT_LABELS,
    };
    const split = (cell: string) => cell.replace(/\s*\(plus the "Skip this question" text button every step has\)$/, '').split(' / ');

    f.STEPS.forEach((key, i) => {
      if (key === 'challenge') return;// two rows, checked below
      const row = byStep.get(String(i + 1));
      assert.ok(row, `step ${i + 1}`);
      assert.equal(row.title, c.STEP_TITLES[key], key);
      assert.equal(row.hint, c.STEP_HINTS[key] ?? '', `${key} hint`);
      if (labelsFor[key]) assert.deepEqual(split(row.options), Object.values(labelsFor[key]), `${key} labels`);
    });

    const student = byStep.get('5 (student)')!;
    const others = byStep.get('5 (others)')!;
    assert.equal(student.title, c.STUDENT_CHALLENGE_TITLE);
    assert.equal(others.title, c.STEP_TITLES.challenge);
    assert.deepEqual(split(student.options), t.STUDENT_CHALLENGES.map((v) => c.CHALLENGE_LABELS[v]));
    assert.deepEqual(split(others.options), t.GENERAL_CHALLENGES.map((v) => c.CHALLENGE_LABELS[v]));

    assert.ok(byStep.get('10')!.options.includes(`"${c.SKIP_QUESTION}"`));
    const slider = byStep.get('11')!.options;
    assert.ok(slider.includes(`"${c.CONFIDENCE_LOW_LABEL}"`) && slider.includes(`"${c.CONFIDENCE_HIGH_LABEL}"`));
    assert.ok(SPEC_DOC.includes(`"${c.SKIP_SETUP}"`));
  });
});

describe('nextQuote', () => {
  test('never the same quote twice in a row, and every quote can come up', () => {
    let seed = 12345;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);// small fixed-seed LCG
    let previous: number | null = null;
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const next = c.nextQuote(previous, random);
      assert.ok(Number.isInteger(next) && next >= 0 && next < c.QUOTES.length);
      assert.notEqual(next, previous);
      seen.add(next);
      previous = next;
    }
    assert.equal(seen.size, c.QUOTES.length);
  });

  test('edges: random 0 and just under 1', () => {
    assert.equal(c.nextQuote(0, () => 0), 1);
    assert.equal(c.nextQuote(c.QUOTES.length - 1, () => 0.999999), c.QUOTES.length - 2);
    assert.equal(c.nextQuote(null, () => 0.999999), c.QUOTES.length - 1);
  });
});
