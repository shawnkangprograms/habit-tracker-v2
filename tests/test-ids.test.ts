// Stage A, set 4: test ids on the demo path (sign-in, Home, ticking a habit, Settings) and on every onboarding option
// and button (constants/testIds.ts). The screens can't be rendered under Node's runner, so these tests read the
// source: every id in the manifest is used, no screen writes a literal id, every control on these screens carries
// one, and the dynamic ids are unique and well formed over the real option sets.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const ids = await import('../constants/testIds.ts');
const flow = await import('../utils/onboarding/flow.ts');
const types = await import('../utils/onboarding/types.ts');
const plan = await import('../utils/onboarding/plan.ts');
const starters = await import('../utils/onboarding/starters.ts');
const {NUDGE_TIMES} = await import('../utils/notificationPrefs.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return rel.endsWith('.tsx') || rel.endsWith('.ts') ? [rel] : [];
  });
}
const APP_FILES = [...sourceFiles('app'), ...sourceFiles('components')];
const APP_SOURCE = APP_FILES.map(read).join('\n');

// The opening tags of `<Name ...>` in a source file: from "<Name" to its closing ">", skipping nested braces
// (an arrow function in a prop contains ">")
function openingTags(source: string, name: string): string[] {
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(`<${name}`, from);
    if (start < 0) return tags;
    const next = source[start + name.length + 1];
    if (next !== ' ' && next !== '\n' && next !== '>' && next !== '/') {
      from = start + 1;
      continue;
    }
    let depth = 0;
    let i = start;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push(source.slice(start, i + 1));
    from = i;
  }
}

describe('the manifest', () => {
  test('it is pure: no imports', () => {
    assert.doesNotMatch(read('constants/testIds.ts'), /^import /m);
  });

  test('slug: lower-case words joined by hyphens; a name with nothing usable becomes "habit"', () => {
    assert.equal(ids.slug('Read 10 pages!'), 'read-10-pages');
    assert.equal(ids.slug('  Walk 20  '), 'walk-20');
    assert.equal(ids.slug('Café au lait'), 'cafe-au-lait');
    assert.equal(ids.slug('💧'), 'habit');
    assert.equal(ids.slug(''), 'habit');
    assert.equal(ids.slug('a--b__c'), 'a-b-c');
  });

  test('every static id is lower-case kebab-case, and no two are equal', () => {
    const all = Object.values(ids.TEST_IDS).flatMap((group) => Object.values(group));
    assert.ok(all.length > 40);
    for (const id of all) assert.match(id, KEBAB, id);
    assert.equal(new Set(all).size, all.length);
  });

  test('every id starts with its screen: tab-, auth-, home-, settings-, onboarding-', () => {
    const prefix: Record<string, string> = {tabs: 'tab-', auth: 'auth-', home: 'home-', settings: 'settings-', onboarding: 'onboarding-'};
    for (const [group, entries] of Object.entries(ids.TEST_IDS)) {
      for (const id of Object.values(entries)) assert.ok(id.startsWith(prefix[group]), `${group}: ${id}`);
    }
  });
});

describe('use', () => {
  test('every static id is used by a screen or component, and every builder too', () => {
    for (const [group, entries] of Object.entries(ids.TEST_IDS)) {
      for (const key of Object.keys(entries)) {
        assert.ok(APP_SOURCE.includes(`TEST_IDS.${group}.${key}`), `TEST_IDS.${group}.${key} is not used`);
      }
    }
    for (const builder of ['habitRowId', 'habitCheckId', 'otherHabitRowId', 'nudgeTimeId', 'optionId', 'routineCardId', 'routineTimeId']) {
      assert.match(APP_SOURCE, new RegExp(`${builder}\\(`), builder);
    }
  });

  test('no screen or component writes a literal test id', () => {
    for (const file of APP_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /testID=["']/, file);
      assert.doesNotMatch(source, /testID=\{["'`]/, file);
      assert.doesNotMatch(source, /tabBarButtonTestID: ["'`]/, file);
    }
  });

  test('the four tabs carry their ids', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    for (const tab of ['home', 'summary', 'profile', 'settings']) {
      assert.match(layout, new RegExp(`tabBarButtonTestID: TEST_IDS\\.tabs\\.${tab},`), tab);
    }
  });
});

describe('every control on the demo path and in onboarding has an id', () => {
  const WITH_IDS = [
    'app/auth.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/settings.tsx', 'app/onboarding.tsx',
    'components/switch-row.tsx', 'components/habit-check.tsx', 'components/insight-card.tsx', 'components/empty-home-card.tsx',
    'components/reflections/reflection-bar.tsx', 'components/onboarding/step-header.tsx', 'components/onboarding/option-button.tsx',
    'components/onboarding/routine-card.tsx', 'components/onboarding/routine-reminder.tsx', 'components/onboarding/skip-dialog.tsx',
  ];

  test('each Pressable and TextInput has a testID prop', () => {
    let checked = 0;
    for (const file of WITH_IDS) {
      const source = read(file);
      for (const name of ['Pressable', 'TextInput']) {
        for (const tag of openingTags(source, name)) {
          checked++;
          assert.match(tag, /testID=\{/, `${file}: ${tag.slice(0, 90).replace(/\s+/g, ' ')}`);
        }
      }
    }
    assert.ok(checked >= 30, String(checked));
  });

  test('the onboarding screen passes an id to every option, button and card it draws', () => {
    const screen = read('app/onboarding.tsx');
    const options = openingTags(screen, 'OptionButton');
    assert.equal(options.length, 2);
    for (const tag of options) assert.match(tag, /testID=\{optionId\(step, value\)\}/);
    const buttons = openingTags(screen, 'PressButton');
    assert.equal(buttons.length, 5);// Continue x3, Start or Done, Add your own
    for (const tag of buttons) assert.match(tag, /testID=\{TEST_IDS\.onboarding\.(next|start|addOwn)\}/);
    // a starter card has an id; the user's own habit (made in the form) has none
    const cards = openingTags(screen, 'RoutineCard');
    assert.equal(cards.filter((tag) => /testID=\{routineCardId\(pick\.id\)\}/.test(tag)).length, 1);
    assert.equal(openingTags(screen, 'ConfidenceSlider').filter((tag) => /testID=\{TEST_IDS\.onboarding\.slider\}/.test(tag)).length, 1);
    assert.match(screen, /<SafeAreaView style=\{styles\.screen\} edges=\{\['top', 'bottom'\]\} testID=\{TEST_IDS\.onboarding\.screen\}>/);
  });

  test('Home: a row and its check share the habit\'s name, and so do the other-days rows', () => {
    const home = read('app/(tabs)/index.tsx');
    assert.match(home, /testID=\{habitRowId\(habit\.habitName\)\}/);
    assert.match(home, /testID=\{habitCheckId\(habit\.habitName\)\}/);
    assert.match(home, /testID=\{otherHabitRowId\(habit\.habitName\)\}/);
    assert.equal(ids.habitRowId('Read 10 pages'), 'home-habit-row-read-10-pages');
    assert.equal(ids.habitCheckId('Read 10 pages'), 'home-habit-check-read-10-pages');
    assert.equal(ids.otherHabitRowId('Read 10 pages'), 'home-other-habit-read-10-pages');
  });
});

describe('accessibility labels on the same controls', () => {
  test('every Pressable in the onboarding header, options, chips, dialog and buttons has a label and a role', () => {
    for (const file of [
      'app/onboarding.tsx', 'components/onboarding/step-header.tsx', 'components/onboarding/option-button.tsx',
      'components/onboarding/routine-card.tsx', 'components/onboarding/routine-reminder.tsx', 'components/onboarding/skip-dialog.tsx',
    ]) {
      for (const tag of openingTags(read(file), 'Pressable')) {
        assert.match(tag, /accessibilityLabel=\{/, `${file}: ${tag.slice(0, 80).replace(/\s+/g, ' ')}`);
        assert.match(tag, /accessibilityRole=/, file);
      }
    }
  });

  test('the sign-in button keeps its label while the spinner replaces its text; the Settings time chips have one', () => {
    const auth = read('app/auth.tsx');
    const submit = openingTags(auth, 'Pressable').find((tag) => tag.includes('TEST_IDS.auth.submit'))!;
    assert.match(submit, /accessibilityLabel=\{buttonLabel\}/);
    const settings = read('app/(tabs)/settings.tsx');
    const chip = openingTags(settings, 'Pressable').find((tag) => tag.includes('nudgeTimeId(time)'))!;
    assert.match(chip, /accessibilityLabel=\{time\}/);
  });

  test('every Pressable and TextInput on the sign-in screen has a role or a label', () => {
    const auth = read('app/auth.tsx');
    for (const tag of openingTags(auth, 'Pressable')) assert.match(tag, /accessibilityRole="button"/);
    assert.match(openingTags(auth, 'TextInput')[0], /accessibilityLabel=\{props\.placeholder\}/);
  });
});

describe('the dynamic ids over the real option sets', () => {
  test('onboarding options: unique, kebab-case, one per step value (both Q5 lists)', () => {
    const all: string[] = [];
    const answers = flow.emptyAnswers();
    for (const step of ['timeBudget', 'occupation', 'habitsFeel', 'derails', 'sleep', 'days', 'badHabit'] as const) {
      for (const value of flow.singleOptions(step, answers)) all.push(ids.optionId(step, value));
    }
    for (const occupation of [null, 'student'] as const) {
      for (const value of flow.singleOptions('challenge', {...answers, occupation})) all.push(ids.optionId('challenge', value));
    }
    for (const step of ['focus', 'values'] as const) {
      for (const value of flow.multiOptions(step)) all.push(ids.optionId(step, value));
    }
    const unique = [...new Set(all)];// the two Q5 lists share 'procrastination'
    assert.ok(unique.length > 40, String(unique.length));
    for (const id of unique) assert.match(id, KEBAB, id);
    assert.equal(ids.optionId('sleep', 'struggle'), 'onboarding-option-sleep-struggle');
    assert.equal(ids.optionId('timeBudget', 'min15'), 'onboarding-option-time-budget-min15');
    assert.equal(ids.optionId('badHabit', 'phone_social'), 'onboarding-option-bad-habit-phone-social');
  });

  test('routine cards: one id per catalog template and the replace pick; time chips and nudge chips are unique', () => {
    const cards = [...types.TEMPLATE_IDS, starters.REPLACE_PICK_ID].map(ids.routineCardId);
    assert.equal(new Set(cards).size, cards.length);
    for (const id of cards) assert.match(id, KEBAB, id);
    const times = plan.ROUTINE_TIME_CHOICES.map(ids.routineTimeId);
    assert.equal(new Set(times).size, times.length);
    for (const id of times) assert.match(id, KEBAB, id);
    const nudge = NUDGE_TIMES.map(ids.nudgeTimeId);
    assert.equal(new Set(nudge).size, nudge.length);
    for (const id of nudge) assert.match(id, KEBAB, id);
    assert.equal(ids.nudgeTimeId('20:30'), 'settings-nudge-time-2030');
  });
});
