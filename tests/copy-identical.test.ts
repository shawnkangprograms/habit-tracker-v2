// Stage A, decision 5: the check that moving a string into utils/copy/<area>.ts never changes its words. The baseline
// (tests/helpers/string-inventory.baseline.json, written by scripts/string-inventory.ts) lists every piece of text
// written inline in app/, components/, hooks/ and services/. Stage C moves them, screen by screen; this test fails
// if a baseline text is no longer written inline AND is not, word for word, in a copy module. Nothing has moved yet,
// so today every text is still inline.
//
// Limits (see docs/STRING_INVENTORY.md): it checks that the words still exist somewhere, not where they are used, so a
// text used in two places is covered by either; it does not see text built from a variable; a text that the app is
// meant to change must be changed in the baseline on purpose (`scripts/string-inventory.ts --write`, then review the diff).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {literalsIn, missingText, scanSource} from './helpers/string-scan.ts';
import {areaOf, BASELINE_PATH, DOC_PATH, scanApp, summary} from '../scripts/string-inventory.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COPY_DIR = 'utils/copy';
const AREAS = ['account', 'admin', 'auth', 'awards', 'common', 'dev', 'habitForm', 'home', 'icons', 'onboarding', 'packs', 'profile', 'progress', 'reflections', 'settings', 'summary'];

type BaselineEntry = {file: string; line: number; kind: string; attr?: string; area: string; partial?: boolean; text: string};
const baseline: BaselineEntry[] = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8'));

function copyLiterals(): string[] {
  const dir = join(ROOT, COPY_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.ts')).flatMap((name) => literalsIn(name, readFileSync(join(dir, name), 'utf8')));
}

describe('the baseline against the app today', () => {
  test('every baseline text is still written inline or is in a copy module word for word', () => {
    const inline = new Set(scanApp().map((e) => e.text));
    assert.deepEqual(missingText(baseline, inline, copyLiterals()), []);
  });

  test('the baseline lists real files, areas that exist, and the text it was written from', () => {
    assert.ok(baseline.length > 300, String(baseline.length));
    for (const entry of baseline) {
      assert.ok(existsSync(join(ROOT, entry.file)), entry.file);
      assert.ok(AREAS.includes(entry.area), `${entry.file}: ${entry.area}`);
      assert.equal(areaOf(entry.file), entry.area, entry.file);
      assert.ok(['alert', 'text', 'attr', 'literal'].includes(entry.kind), entry.kind);
      assert.ok(entry.text.trim() === entry.text && entry.text.length > 0 && !/\s{2,}/.test(entry.text), entry.text);
    }
  });

  test('docs/STRING_INVENTORY.md is the baseline: the same total, distinct count, and every area and file', () => {
    const doc = readFileSync(join(ROOT, DOC_PATH), 'utf8');
    const s = summary(baseline.map((b) => ({...b, kind: b.kind as 'alert'})));
    assert.match(doc, new RegExp(`\\*\\*${s.total} strings \\(${s.distinct} distinct\\)\\.\\*\\*`));
    for (const [area, n] of s.areas) assert.match(doc, new RegExp(`\\| ${area} \\| ${n} \\|`), area);
    for (const [file, n] of s.files) assert.ok(doc.includes(`| ${file} | ${n} |`), file);
    assert.equal((doc.match(/^- \d+ /gm) ?? []).length, baseline.length);
  });

  test('every Alert.alert in the app that spells its words inline is in the baseline, and the admin and dev screens are tagged', () => {
    const alerts = baseline.filter((e) => e.kind === 'alert');
    assert.ok(alerts.length >= 40, String(alerts.length));
    assert.ok(baseline.some((e) => e.area === 'admin') && baseline.some((e) => e.area === 'dev'));
    assert.ok(baseline.filter((e) => !['admin', 'dev'].includes(e.area)).length > 150);
  });
});

describe('the copy modules (utils/copy/<area>.ts)', () => {
  test('each is named for an area and is pure: no React, native, Firebase or service imports', () => {
    const dir = join(ROOT, COPY_DIR);
    if (!existsSync(dir)) return;// none yet
    for (const name of readdirSync(dir)) {
      assert.match(name, /^[a-zA-Z]+\.ts$/, name);
      assert.ok(AREAS.includes(name.replace(/\.ts$/, '')), `${name} is not an area`);
      const source = readFileSync(join(dir, name), 'utf8');
      assert.doesNotMatch(source, /from ['"](react|react-native|expo|firebase|@\/services|@expo)/, name);
    }
  });
});

describe('the harness itself', () => {
  const scan = (source: string) => scanSource('x.tsx', source);
  const texts = (source: string) => scan(source).map((f) => f.text);
  const check = (before: string, copy: string, after = '') => {
    const base = scan(before);
    return missingText(base, new Set(scan(after).map((f) => f.text)), literalsIn('copy.ts', copy));
  };

  test('it finds alerts (title, message and button labels), JSX text, text props, entities and sentence-like constants', () => {
    const found = scan(`
      const msg = 'Something went wrong. Please try again.';
      function f() {
        Alert.alert('Delete habit?', 'This habit will be removed from Home.', [{text: 'Cancel'}, {text: 'Delete'}]);
        Alert.alert(\`Delete "\${name}"?\`);
      }
      export const x = (
        <View>
          <Text>Can&apos;t sign in</Text>
          <Text>Level {n}</Text>
          <TextInput placeholder="Email address" accessibilityLabel={ok ? 'Mark as done' : 'Mark as not done'} testID="skipped-id" />
          {open ? 'Hide' : 'Show more'}
        </View>
      );
    `);
    const byText = new Map(found.map((f) => [f.text, f]));
    for (const text of ['Something went wrong. Please try again.', 'Delete habit?', 'This habit will be removed from Home.', 'Cancel',
      'Delete', 'Delete "${…}"?', "Can't sign in", 'Email address', 'Mark as done', 'Mark as not done', 'Hide', 'Show more']) {
      assert.ok(byText.has(text), `missing ${text}`);
    }
    assert.equal(byText.get('Level')?.partial, true);// a word beside a {value}
    assert.equal(byText.get('Email address')?.kind, 'attr');
    assert.equal(byText.get('Cancel')?.kind, 'alert');
    assert.equal(byText.get('Something went wrong. Please try again.')?.kind, 'literal');
    assert.ok(!found.some((f) => f.text === 'skipped-id'));// testID is not text
  });

  test('it ignores imports, logs, comparisons, keys, SVG paths and SQL', () => {
    assert.deepEqual(texts(`
      import x from 'Some Module Name';
      console.log('Failed to open the thing.');
      const a = mode === 'Sign In';
      const b = {'Key With Spaces': 1};
      const path = 'M50 20 L84 30 L84 60 Q84 88 50 104 Z';
      const sql = 'SELECT name FROM habits WHERE id = ?';
      const id = 'plain-id';
    `), []);
  });

  test('text moved into a copy module word for word passes', () => {
    const before = `Alert.alert('Delete habit?', 'This habit will be removed from Home.');
      const x = <Text>Add a habit</Text>;
      const y = <Text>Can&apos;t sign in</Text>;`;
    const copy = `export const DELETE_TITLE = 'Delete habit?';\nexport const DELETE_BODY = \`This habit will be removed from Home.\`;\nexport const ADD = 'Add a habit';\nexport const NO = "Can't sign in";`;
    assert.deepEqual(check(before, copy), []);
  });

  test('a changed word is caught, whether the text moved or stayed', () => {
    const before = `const x = <Text>Add a habit</Text>; Alert.alert('Delete habit?');`;
    assert.deepEqual(check(before, `export const ADD = 'Add habit';\nexport const T = 'Delete habit?';`), ['Add a habit']);
    assert.deepEqual(check(before, '', `const x = <Text>Add a habit</Text>; Alert.alert('Delete a habit?');`), ['Delete habit?']);
    assert.deepEqual(check(before, `export const ADD = 'Add a habit.';\nexport const T = 'Delete habit?';`), ['Add a habit']);// punctuation counts
    assert.deepEqual(check(before, `export const ADD = 'add a habit';\nexport const T = 'Delete habit?';`), ['Add a habit']);// so does case
  });

  test('a text with a value keeps its words and its slots when it becomes a function', () => {
    const before = 'Alert.alert(`Delete "${name}"?`, `${count} habits will be removed.`);';
    assert.deepEqual(check(before, 'export const del = (name: string) => `Delete "${name}"?`;\nexport const rm = (n: number) => `${n} habits will be removed.`;'), []);
    assert.deepEqual(check(before, 'export const del = (name: string) => `Delete ${name}?`;\nexport const rm = (n: number) => `${n} habits will be removed.`;'), ['Delete "${…}"?']);
    assert.deepEqual(check(before, 'export const del = (name: string) => `Delete "${name}"?`;\nexport const rm = (n: number) => `${n} habit(s) will be removed.`;'), ['${…} habits will be removed.']);
  });

  test('a piece of a longer text only has to be part of a longer text; a whole text has to be equal', () => {
    const before = 'const x = <Text>Level {n}</Text>;';
    assert.deepEqual(check(before, 'export const level = (n: number) => `Level ${n}`;'), []);
    assert.deepEqual(check(before, 'export const level = (n: number) => `Rank ${n}`;'), ['Level']);
    const whole = 'const x = <Text>Add a habit</Text>;';
    assert.deepEqual(check(whole, "export const T = 'Please add a habit today';"), ['Add a habit']);// not a piece: no match
  });

  test('the two halves of a + are pieces of one text', () => {
    const before = "Alert.alert('Oops', 'You can try again ' + 'in a moment.');";
    assert.deepEqual(check(before, "export const M = 'You can try again in a moment.';\nexport const T = 'Oops';"), []);
    assert.deepEqual(check(before, "export const M = 'You can try again later.';\nexport const T = 'Oops';"), ['in a moment.']);
  });
});
