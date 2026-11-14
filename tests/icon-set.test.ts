// C3 Set 1: the habit icon set (constants/habitIconSet.ts), its words (utils/copy/icons.ts), the tables built from it
// (glyphs, colours, radar areas) and the release switch. Every glyph is checked against the glyph map that is actually
// installed, so a misspelled or removed glyph fails here, not on a phone.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const set = await import('../constants/habitIconSet.ts');
const habits = await import('../constants/habits.ts');
const glyphs = await import('../constants/habitGlyphs.ts');
const {colors, ICON_COLORS, ICON_GROUP_COLORS} = await import('../constants/theme.ts');
const words = await import('../utils/copy/icons.ts');
const {validateIcon} = await import('../validation/validators.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GLYPH_MAP: Record<string, number> = JSON.parse(readFileSync(join(ROOT,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'), 'utf8'));

const SET = set.HABIT_ICON_SET;
const IDS = SET.map((i) => i.id as string);

// The unknown id the tests use for "written by a newer build". It must never be a real icon, or those tests would
// quietly test a known icon instead (they used 'rocket' until C3, which was a proposed icon).
const TEST_UNKNOWN = 'zz_test_unknown';

describe('the set: ids, glyphs and groups', () => {
  test('146 icons in seven groups, each group with at least ten', () => {
    assert.equal(SET.length, 146);
    assert.deepEqual([...set.ICON_GROUPS], ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations', 'General']);
    for (const group of set.ICON_GROUPS) assert.ok(SET.filter((i) => i.group === group).length >= 10, group);
  });

  test('every id is unique, lower-case ASCII (letters, digits, _), starts with a letter, and fits the stored shape', () => {
    assert.equal(new Set(IDS).size, IDS.length);
    for (const id of IDS) {
      assert.match(id, /^[a-z][a-z0-9_]{0,31}$/, id);
      assert.match(id, habits.STORED_ICON_RE, id);// what the rules and the sync parser allow (1-32 printable ASCII)
    }
  });

  test('every glyph exists in the installed MaterialCommunityIcons glyph map, and no two icons share one', () => {
    for (const icon of SET) assert.ok(Object.hasOwn(GLYPH_MAP, icon.glyph), `${icon.id}: ${icon.glyph}`);
    assert.equal(new Set(SET.map((i) => i.glyph)).size, SET.length);
    assert.ok(Object.keys(GLYPH_MAP).length > 5000);// the real map, not an empty file
  });

  test('the twelve ids of 1.0 are unchanged: same ids, same order, same glyphs', () => {
    assert.deepEqual([...set.LEGACY_ICON_IDS], ['book', 'water', 'run', 'meditate', 'sleep', 'food', 'study', 'work', 'music', 'money', 'heart', 'star']);
    assert.deepEqual(Object.fromEntries(set.LEGACY_ICON_IDS.map((id) => [id, glyphs.HABIT_ICONS[id]])), {
      book: 'book-open-outline', water: 'water-outline', run: 'pulse', meditate: 'leaf', sleep: 'moon-waning-crescent',
      food: 'silverware-fork-knife', study: 'school-outline', work: 'briefcase-outline', music: 'music-note',
      money: 'currency-usd', heart: 'heart-outline', star: 'star-outline',
    });
    for (const id of set.LEGACY_ICON_IDS) assert.ok(IDS.includes(id), id);
  });

  test('the mosque is in, beside the church, both in Relations (D1)', () => {
    const mosque = SET.find((i) => i.id === 'mosque');
    const church = SET.find((i) => i.id === 'faith');
    assert.deepEqual(mosque && {glyph: mosque.glyph, group: mosque.group}, {glyph: 'mosque-outline', group: 'Relations'});
    assert.deepEqual(church && {glyph: church.glyph, group: church.group}, {glyph: 'church-outline', group: 'Relations'});
    assert.equal(words.ICON_SPOKEN_LABELS.mosque, 'Mosque');
    assert.equal(words.ICON_SPOKEN_LABELS.faith, 'Church');
  });

  test('none of the 22 cut icons is in the set', () => {
    for (const id of ['heart_rate', 'quiet', 'night', 'alarm', 'sun', 'target', 'finish', 'check', 'streak', 'today', 'clock',
      'hourglass', 'handwriting', 'practice_code', 'call', 'email', 'bank', 'water_plants', 'smile', 'rocket', 'forever', 'crown']) {
      assert.ok(!IDS.includes(id), id);
    }
  });

  test('the tests\' unknown id is never a real icon (nor the old one, nor the other test ids)', () => {
    for (const id of [TEST_UNKNOWN, 'rocket', 'comet', 'x', 'unknown']) assert.ok(!IDS.includes(id), id);
    assert.equal(glyphs.glyphFor(TEST_UNKNOWN), glyphs.FALLBACK_GLYPH);
  });
});

describe('the words: a spoken label and keywords for every icon', () => {
  test('every id has a label and at least two keywords, and the tables have no other keys', () => {
    assert.deepEqual(Object.keys(words.ICON_SPOKEN_LABELS).sort(), [...IDS].sort());
    assert.deepEqual(Object.keys(words.ICON_KEYWORDS).sort(), [...IDS].sort());
    for (const id of IDS) {
      const label = words.ICON_SPOKEN_LABELS[id as keyof typeof words.ICON_SPOKEN_LABELS];
      assert.ok(label.trim() === label && label.length >= 2 && /^[A-Z]/.test(label), `${id}: "${label}"`);
      const keywords = words.ICON_KEYWORDS[id as keyof typeof words.ICON_KEYWORDS];
      assert.ok(keywords.length >= 2, id);
      for (const k of keywords) assert.match(k, /^[a-z]+$/, `${id}: ${k}`);
    }
  });

  test('no two icons share a label (TalkBack must tell them apart)', () => {
    const labels = Object.values(words.ICON_SPOKEN_LABELS);
    assert.equal(new Set(labels).size, labels.length);
  });

  test('the group tab labels are the six areas and General', () => {
    assert.deepEqual(words.ICON_GROUP_LABELS, {
      Health: 'Health', Mind: 'Mind', Discipline: 'Discipline', Career: 'Career', Learning: 'Learning', Relations: 'Relations', General: 'General',
    });
  });
});

describe('the tables built from the set', () => {
  test('every icon of the set is drawn with its own glyph, selectable or not (a newer phone\'s choice is not a star)', () => {
    for (const icon of SET) assert.equal(glyphs.glyphFor(icon.id), icon.glyph, icon.id);
  });

  test('colours (D4): the twelve keep theirs; every other icon takes its group\'s colour; group colours are tokens', () => {
    assert.deepEqual(Object.fromEntries(set.LEGACY_ICON_IDS.map((id) => [id, ICON_COLORS[id]])), {
      book: colors.amber, water: colors.pink, run: colors.green, meditate: colors.purple, sleep: colors.purple, food: colors.amber,
      study: colors.blue, work: colors.blue, music: colors.purple, money: colors.green, heart: colors.pink, star: colors.accent,
    });
    for (const icon of SET) {
      if ((set.LEGACY_ICON_IDS as readonly string[]).includes(icon.id)) continue;
      assert.equal(ICON_COLORS[icon.id], ICON_GROUP_COLORS[icon.group], icon.id);
    }
    const tokens = new Set(Object.values(colors));
    for (const [group, colour] of Object.entries(ICON_GROUP_COLORS)) assert.ok(tokens.has(colour as never), group);
    assert.deepEqual(ICON_GROUP_COLORS, {
      Health: colors.green, Mind: colors.purple, Discipline: colors.accent, Career: colors.blue, Learning: colors.amber,
      Relations: colors.pink, General: colors.accent,
    });
    assert.equal(Object.keys(ICON_COLORS).length, SET.length);
  });
});

describe('the release switch (D6)', () => {
  test('it is built off: a release commit changes the switch and this line together', () => {
    assert.equal(habits.RELEASE_NEW_ICONS, false);
  });

  test('while off, only the twelve of 1.0 can be chosen; the type still covers the whole set', () => {
    assert.deepEqual([...habits.ICON_IDS], [...set.LEGACY_ICON_IDS]);
    assert.deepEqual([...set.ALL_ICON_IDS], IDS);
    const later: import('../constants/habits.ts').IconId = 'mosque';// compiles: IconId is the full union
    assert.equal(habits.isKnownIcon(later), false);
    assert.equal(validateIcon('mosque').valid, false);// not a new choice yet
    assert.equal(validateIcon('mosque', 'mosque').valid, true);// but kept when a habit already has it
    assert.equal(validateIcon('book').valid, true);
  });

  test('the selectable list is the switch and nothing else', () => {
    const source = readFileSync(join(ROOT, 'constants/habits.ts'), 'utf8');
    assert.match(source, /export const RELEASE_NEW_ICONS = false;/);
    assert.match(source, /export const ICON_IDS: readonly IconId\[\] = RELEASE_NEW_ICONS \? ALL_ICON_IDS : LEGACY_ICON_IDS;/);
  });
});
