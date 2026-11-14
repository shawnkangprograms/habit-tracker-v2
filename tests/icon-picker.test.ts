// C3 Set 2: the shared icon picker (components/icon-picker.tsx, pure parts in utils/iconPicker.ts), both screens that
// use it, and the short update id on the You version line. The pure functions take the selectable list as an
// argument, so both modes are tested here whatever the release switch says: flat (only the twelve of 1.0, today's
// grid) and tabs (search above group tabs, empty groups hidden).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const picker = await import('../utils/iconPicker.ts');
const set = await import('../constants/habitIconSet.ts');
const ids = await import('../constants/testIds.ts');
const words = await import('../utils/copy/icons.ts');
const settingsCopy = await import('../utils/copy/settings.ts');
const ota = await import('../services/otaUpdatesCore.ts');

type IconId = import('../constants/habitIconSet.ts').IconId;

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\/.*$/gm, '');

const LEGACY: readonly IconId[] = set.LEGACY_ICON_IDS;
const ALL: readonly IconId[] = set.ALL_ICON_IDS;

describe('the two modes', () => {
  test('only the twelve of 1.0 selectable (the switch off): flat, today\'s grid of twelve', () => {
    assert.equal(picker.pickerMode(LEGACY), 'flat');
    assert.equal(picker.pickerMode(LEGACY.slice(0, 5)), 'flat');
  });

  test('any icon beyond the twelve (the switch on, or a mix): tabs and search', () => {
    assert.equal(picker.pickerMode(ALL), 'tabs');
    assert.equal(picker.pickerMode([...LEGACY, 'yoga']), 'tabs');
  });

  test('a group with no selectable icon is hidden; the rest keep the set\'s order', () => {
    assert.deepEqual(picker.visibleGroups(ALL), ['Health', 'Mind', 'Discipline', 'Career', 'Learning', 'Relations', 'General']);
    // the twelve of 1.0 have no Discipline icon
    assert.deepEqual(picker.visibleGroups([...LEGACY, 'yoga']), ['Health', 'Mind', 'Career', 'Learning', 'Relations', 'General']);
    assert.deepEqual(picker.visibleGroups(['yoga', 'mosque']), ['Health', 'Relations']);
    assert.deepEqual(picker.visibleGroups([]), []);
  });

  test('a group shows its selectable icons only, in the set\'s order', () => {
    assert.deepEqual(picker.groupIcons('Relations', ['mosque', 'heart', 'faith']), ['heart', 'faith', 'mosque']);
    assert.deepEqual(picker.groupIcons('Health', LEGACY), ['run', 'water', 'food', 'sleep']);
    assert.equal(picker.groupIcons('Health', ALL).length, 34);
  });

  test('the tabs open on the chosen icon\'s group, else the first shown group', () => {
    assert.equal(picker.startGroup('mosque', ALL), 'Relations');
    assert.equal(picker.startGroup(null, ALL), 'Health');
    assert.equal(picker.startGroup('checklist', [...LEGACY, 'yoga']), 'Health');// Discipline is hidden there
    assert.equal(picker.startGroup('zz_test_unknown', ALL), 'Health');
    assert.equal(picker.startGroup(null, []), null);
  });
});

describe('search', () => {
  test('matches labels and keywords from the start of a word, in every group', () => {
    assert.deepEqual(picker.searchIcons('gym', ALL), ['weights']);
    const phone = picker.searchIcons('phone', ALL);
    for (const id of ['no_phone', 'screen_limit', 'call_family']) assert.ok(phone.includes(id as IconId), id);
    assert.deepEqual(picker.searchIcons('walk dog', ALL), ['dog']);// every typed word must match
    assert.deepEqual(picker.searchIcons('mosque', ALL), ['mosque']);
    assert.deepEqual(picker.searchIcons('ga', ALL), ['flowers', 'puzzle', 'chess']);// Garden, then the "game" keyword, in set order
  });

  test('ignores case, accents and extra spaces; nothing typed gives no results (the group shows instead)', () => {
    assert.deepEqual(picker.searchIcons('  YOGA ', ALL), ['yoga']);
    assert.deepEqual(picker.searchIcons('yóga', ALL), ['yoga']);
    assert.deepEqual(picker.searchIcons('', ALL), []);
    assert.deepEqual(picker.searchIcons('   ', ALL), []);
  });

  test('only selectable icons are found, and at most 40', () => {
    assert.deepEqual(picker.searchIcons('yoga', LEGACY), []);
    assert.deepEqual(picker.searchIcons('read', LEGACY), ['book']);
    const many = picker.searchIcons('s', ALL);
    assert.equal(many.length, picker.SEARCH_CAP);
    assert.equal(picker.SEARCH_CAP, 40);
    assert.equal(picker.searchIcons('s', ALL, 3).length, 3);
  });

  test('no match is an empty list (the picker shows its empty line)', () => {
    assert.deepEqual(picker.searchIcons('zzzz', ALL), []);
  });
});

describe('the caption and the unknown-icon line', () => {
  test('the caption names the chosen icon; with none chosen, the icon the habit has if this build knows it', () => {
    assert.equal(picker.captionFor('mosque', null), 'Mosque');
    assert.equal(picker.captionFor('run', 'zz_test_unknown'), 'Exercise');
    assert.equal(picker.captionFor(null, 'yoga'), 'Yoga');// a set icon the switch still holds back
    assert.equal(picker.captionFor(null, 'zz_test_unknown'), null);
    assert.equal(picker.captionFor(null, null), null);
  });

  test('the "newer version" line only for a stored id that is not in the set at all, while nothing else is chosen', () => {
    assert.equal(picker.showUnknownLine(null, 'zz_test_unknown'), true);
    assert.equal(picker.showUnknownLine(null, 'yoga'), false);// in the set: drawn and named, not "newer"
    assert.equal(picker.showUnknownLine('book', 'zz_test_unknown'), false);// another icon is chosen
    assert.equal(picker.showUnknownLine(null, null), false);
  });

  test('the words are the approved ones', () => {
    assert.equal(words.ICON_UNKNOWN_LINE, "This habit's icon is from a newer version of HabitQuest. Pick one to change it.");
    assert.equal(words.ICON_SEARCH_PLACEHOLDER, 'Search icons');
    assert.equal(words.ICON_SEARCH_EMPTY, 'No icons match.');
    assert.equal(words.ICON_GRID_LABEL, 'Habit icon');
    assert.equal(words.ICON_TABS_LABEL, 'Icon groups');
  });
});

describe('test ids', () => {
  test('one per tile (icon-<id>, kebab-case), one per group tab, one for the search field; all unique', () => {
    assert.equal(ids.iconTileId('no_sugar'), 'icon-no-sugar');
    assert.equal(ids.iconTileId('mosque'), 'icon-mosque');
    assert.equal(ids.iconTabId('Health'), 'icon-tab-health');
    assert.equal(ids.TEST_IDS.icon.search, 'icon-search');
    const tiles = ALL.map(ids.iconTileId);
    const tabs = set.ICON_GROUPS.map(ids.iconTabId);
    const every = [...tiles, ...tabs, ids.TEST_IDS.icon.search];
    assert.equal(new Set(every).size, every.length);
    for (const id of every) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
  });
});

describe('the component', () => {
  const src = code('components/icon-picker.tsx');

  test('tiles: 52x52, a radio in a radio group, the spoken label, the selected state, the tile test id', () => {
    assert.match(src, /accessibilityRole="radiogroup" accessibilityLabel=\{ICON_GRID_LABEL\}/);
    assert.match(src, /accessibilityRole="radio"\s+accessibilityLabel=\{spokenLabel\(id\)\}\s+accessibilityState=\{\{selected, checked: selected\}\}\s+testID=\{iconTileId\(id\)\}/);
    assert.match(src, /tile: \{\s*width: 52,\s*height: 52,/);
  });

  test('flat mode draws the selectable list as it is; tabs mode the search field and the tabs', () => {
    assert.match(src, /if \(mode === 'flat'\) return \[\.\.\.selectable\];/);
    assert.match(src, /\{mode === 'tabs' && \(/);
    assert.match(src, /selectable = ICON_IDS/);// the screens get the switch's list
  });

  test('the tabs scroller keeps taps while the keyboard is open; each tab is a Pill tab with its test id', () => {
    assert.match(src, /<ScrollView\s+horizontal\s+showsHorizontalScrollIndicator=\{false\}\s+keyboardShouldPersistTaps="handled"/);
    assert.match(src, /accessibilityRole="tablist"/);
    assert.match(src, /role="tab"/);
    assert.match(src, /testID=\{iconTabId\(g\)\}/);
    assert.match(src, /\{!searching && \(/);// typing shows the results across groups instead of the tabs
  });

  test('the search field: its test id, label and placeholder from the copy; the empty line; the caption; the unknown line', () => {
    assert.match(src, /testID=\{TEST_IDS\.icon\.search\}/);
    assert.match(src, /placeholder=\{ICON_SEARCH_PLACEHOLDER\}/);
    assert.match(src, /accessibilityLabel=\{ICON_SEARCH_PLACEHOLDER\}/);
    assert.match(src, /\{searching && shown\.length === 0 && \(/);
    assert.match(src, /\{ICON_SEARCH_EMPTY\}/);
    assert.match(src, /\{caption && <AppText[^>]*>\{caption\}<\/AppText>\}/);
    assert.match(src, /\{showUnknownLine\(value, stored\) && <AppText[^>]*>\{ICON_UNKNOWN_LINE\}<\/AppText>\}/);
  });

  test('no words written in the component: every string comes from utils/copy/', () => {
    assert.doesNotMatch(src, />[A-Za-z][^<{]*</);// no JSX text
    assert.doesNotMatch(src, /(placeholder|accessibilityLabel)="[^"]+"/);
  });
});

describe('both screens use the picker', () => {
  test('the habit form passes the kept icon; the admin catalog form\'s IconGrid passes its value', () => {
    assert.match(code('app/habit-form.tsx'), /<IconPicker value=\{icon\} stored=\{keptIcon\} onChange=\{\(id\) => \{ setIcon\(id\); clearError\('icon'\); \}\} \/>/);
    assert.match(code('components/habit-fields.tsx'), /<IconPicker value=\{value\} onChange=\{onChange\} \/>/);
    for (const file of ['app/habit-form.tsx', 'components/habit-fields.tsx', 'app/admin/catalog-form.tsx']) {
      assert.doesNotMatch(code(file), /ICON_IDS\.map|accessibilityLabel=\{id\}/, file);
    }
  });
});

describe('the update id on the You version line (D5)', () => {
  test('the first 8 characters of the running update\'s id; nothing when there is none', () => {
    assert.equal(ota.shortUpdateId('0f3c9a2e-41b7-4c55-9a6e-1d2f3a4b5c6d'), '0f3c9a2e');
    assert.equal(ota.shortUpdateId(null), null);
    assert.equal(ota.shortUpdateId(''), null);
    assert.equal(ota.shortUpdateId('   '), null);
    assert.equal(ota.UPDATE_ID_SHORT, 8);
  });

  test('the line: version, build, then the update', () => {
    assert.equal(settingsCopy.versionLine('1.0.0', 3), 'Version 1.0.0 (build 3)');
    assert.equal(settingsCopy.versionLine('1.0.0', null), 'Version 1.0.0');
    assert.equal(settingsCopy.versionLine('1.0.0', 3) + settingsCopy.updateTag('0f3c9a2e'), 'Version 1.0.0 (build 3) · update 0f3c9a2e');
    assert.equal(settingsCopy.updateTag(null), '');
  });
});
