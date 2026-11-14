// First and last name (docs/HABITQUEST_DESIGN.md, names decision): validation (validation/validators.ts), the
// greeting (utils/greeting.ts), the copy kept on this phone (utils/profileName.ts, services/profileNameCore.ts),
// the sign-up order, and the rule that the name never reaches the insight request, sync or the admin screens.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const v = await import('../validation/validators.ts');
const gr = await import('../utils/greeting.ts');
const pn = await import('../utils/profileName.ts');
const {createProfileNameStore} = await import('../services/profileNameCore.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('validatePersonName', () => {
  test('trims and collapses inner spaces', () => {
    assert.deepEqual(v.validatePersonName('  Ama  ', 'first'), {valid: true, value: 'Ama'});
    assert.deepEqual(v.validatePersonName(' Mary   Ann ', 'first'), {valid: true, value: 'Mary Ann'});
    assert.deepEqual(v.validatePersonName('Van\tder  Berg', 'last'), {valid: true, value: 'Van der Berg'});
  });

  test('names from many places pass, both apostrophes included (iOS types ’)', () => {
    const names = [
      "Kang'ethe", 'Kang’ethe', "O'Brien", 'Jean-Luc', 'Zoë', 'Nguyễn', 'Wanjiru', 'José María', 'Łukasz',
      'Ἀλέξανδρος', 'Мария', 'محمد', '李', 'देवनागरी', 'Ngũgĩ', 'Chimamanda Ngozi',
    ];
    for (const name of names) assert.deepEqual(v.validatePersonName(name, 'last'), {valid: true, value: name}, name);
  });

  test('1 and 40 characters pass, 41 fails; counted in code points', () => {
    assert.ok(v.validatePersonName('A', 'first').valid);
    assert.ok(v.validatePersonName('a'.repeat(40), 'first').valid);
    assert.deepEqual(v.validatePersonName('a'.repeat(41), 'first'), {valid: false, error: 'First name must be 40 characters or fewer.'});
    assert.deepEqual(v.validatePersonName('a'.repeat(41), 'last'), {valid: false, error: 'Last name must be 40 characters or fewer.'});
    // a letter outside the BMP is 2 UTF-16 units but 1 character: 40 of them still pass
    const wide = '𐐀'.repeat(40);
    assert.equal(wide.length, 80);
    assert.ok(v.validatePersonName(wide, 'first').valid);
  });

  test('empty or blank: asks for the name', () => {
    for (const input of ['', '   ', null, undefined, 7]) {
      assert.deepEqual(v.validatePersonName(input, 'first'), {valid: false, error: 'Please enter your first name.'}, String(input));
      assert.deepEqual(v.validatePersonName(input, 'last'), {valid: false, error: 'Please enter your last name.'}, String(input));
    }
  });

  test('digits, symbols, emoji, or punctuation with no letter: rejected', () => {
    const bad = ['Ama2', 'ama@home', 'Ama!', 'Ama.', '😀', 'Ama 😀', "-'-", '--', 'A_B', 'Ama,Kofi'];
    for (const name of bad) {
      assert.deepEqual(v.validatePersonName(name, 'first'), {valid: false, error: 'Use letters, spaces, hyphens and apostrophes only.'}, name);
    }
  });
});

describe('when a field shows its message', () => {
  const bad = v.validatePersonName('', 'first');
  const good = v.validatePersonName('Ama', 'first');

  test('nothing before the field is left or the form submitted, even while invalid (the first character)', () => {
    assert.equal(pn.visibleError(bad, false), undefined);
    assert.equal(pn.visibleError(v.validatePersonName('A2', 'first'), false), undefined);
  });

  test('after blur or submit: the message, and it clears once the value is fixed', () => {
    assert.equal(pn.visibleError(bad, true), 'Please enter your first name.');
    assert.equal(pn.visibleError(good, true), undefined);
  });
});

describe('greeting', () => {
  test('by the hour: morning before 12:00, afternoon 12:00 to 16:59, evening from 17:00', () => {
    const cases: [number, string][] = [
      [0, 'Good morning'], [11, 'Good morning'], // 11:59 is still hour 11
      [12, 'Good afternoon'], [16, 'Good afternoon'], // 16:59 is still hour 16
      [17, 'Good evening'], [23, 'Good evening'],
    ];
    for (const [hour, greeting] of cases) {
      assert.equal(gr.greetingFor(hour, 'Ama'), `${greeting}, Ama`, String(hour));
      assert.equal(gr.greetingFor(hour, null), greeting, String(hour));
    }
  });

  test('no name, or a blank one: no comma', () => {
    for (const name of [null, undefined, '', '   ']) assert.equal(gr.greetingFor(9, name), 'Good morning', String(name));
  });

  test('the first name: the stored one, else the first word of displayName, else none', () => {
    assert.equal(gr.firstNameFor('Ama', 'Someone Else'), 'Ama');
    assert.equal(gr.firstNameFor(null, '  Kofi Mensah '), 'Kofi');
    assert.equal(gr.firstNameFor('  ', 'Kofi'), 'Kofi');
    assert.equal(gr.firstNameFor(null, null), null);
    assert.equal(gr.firstNameFor(undefined, '   '), null);
  });
});

describe('the name kept on this phone', () => {
  const AMA = {uid: 'u1', firstName: 'Ama', lastName: 'Kang’ethe'};

  test('round-trips, and is only ever returned for its own account', () => {
    const parsed = pn.parseProfileName(pn.serialiseProfileName(AMA));
    assert.deepEqual(parsed, AMA);
    assert.deepEqual(pn.nameForUid(parsed, 'u1'), AMA);
    assert.equal(pn.nameForUid(parsed, 'u2'), null);
    assert.equal(pn.nameForUid(parsed, null), null);
  });

  test('a corrupt or invalid value is "no name"', () => {
    for (const raw of [null, '', 'x', '[]', '{}', '{"uid":"u1"}', '{"uid":"","firstName":"Ama"}', '{"uid":"u1","firstName":"A2"}']) {
      assert.equal(pn.parseProfileName(raw), null, String(raw));
    }
    assert.deepEqual(pn.parseProfileName('{"uid":"u1","firstName":"Ama"}'), {uid: 'u1', firstName: 'Ama', lastName: null});
  });

  test('from the users doc: its names, else the first word of displayName (older accounts), else nothing', () => {
    assert.deepEqual(pn.profileNameFromDoc('u1', {firstName: 'Ama', lastName: 'Owusu'}, 'Old Name'), {uid: 'u1', firstName: 'Ama', lastName: 'Owusu'});
    assert.deepEqual(pn.profileNameFromDoc('u1', {}, 'Kofi Mensah'), {uid: 'u1', firstName: 'Kofi', lastName: null});
    assert.deepEqual(pn.profileNameFromDoc('u1', null, 'Kofi'), {uid: 'u1', firstName: 'Kofi', lastName: null});
    assert.equal(pn.profileNameFromDoc('u1', {}, null), null);
    assert.equal(pn.profileNameFromDoc('u1', {firstName: ''}, ''), null);
  });

  test('the store: load, set, clear; a missing name never wipes one; listeners hear changes', async () => {
    const data = new Map<string, string>();
    const store = createProfileNameStore({
      setItem: async (k, val) => { data.set(k, val); },
      removeItem: async (k) => { data.delete(k); },
    });
    let heard = 0;
    store.subscribe(() => { heard += 1; });
    store.load(null);
    assert.equal(store.get('u1'), null);
    await store.set(AMA);
    assert.deepEqual(store.get('u1'), AMA);
    assert.equal(store.get('u2'), null);
    assert.equal(data.get(pn.PROFILE_NAME_KEY), pn.serialiseProfileName(AMA));
    await store.set(null);// a doc with no name
    assert.deepEqual(store.get('u1'), AMA);
    await store.set({...AMA});// the same name: no change
    await store.clear('u2');// another account: nothing
    assert.deepEqual(store.get('u1'), AMA);
    await store.clear('u1');// a rolled-back sign-up
    assert.equal(store.get('u1'), null);
    assert.equal(data.has(pn.PROFILE_NAME_KEY), false);
    assert.equal(heard, 3);// load, set, clear
  });

  test('a failed save never throws and keeps the name for this app run', async () => {
    const store = createProfileNameStore({
      setItem: async () => { throw new Error('full'); },
      removeItem: async () => {},
    });
    await store.set(AMA);
    assert.deepEqual(store.get('u1'), AMA);
  });

  test('read in the same native call as the sign-in marker (no extra startup read)', () => {
    const marker = source('services/authMarker.ts');
    assert.match(marker, /AsyncStorage\.multiGet\(\[KEY, PROFILE_NAME_KEY, PACKS_MIRROR_KEY\]\)/);
    assert.doesNotMatch(marker, /AsyncStorage\.getItem\(/);
  });
});

describe('sign-up and saving', () => {
  const actions = source('services/authActions.js');
  const signUp = actions.slice(actions.indexOf('export async function signUp'), actions.indexOf('export async function saveName'));

  test('the names go in the same profile write as the age (kept pending until it lands); no rollback clears them', () => {
    assert.match(signUp, /const profile = \{age, firstName: name\.firstName, lastName: name\.lastName\};/);
    assert.match(source('services/profileCompletion.ts'),
      /setDoc\(ref, \{\s*age: profile\.age, firstName: profile\.firstName, lastName: profile\.lastName, createdAt: serverTimestamp\(\),\s*\}\)/);
    assert.equal(signUp.indexOf('profileNameStore.clear('), -1);
    // displayName comes after the profile write attempt
    assert.ok(signUp.indexOf('updateProfile(') > signUp.indexOf('profileCompletion.writeNow(uid, profile)'));
  });

  test('the sign-up form checks both names before creating the account', () => {
    const form = source('app/auth.tsx');
    const submit = form.slice(form.indexOf('const handleSubmit'), form.indexOf('const isReset'));
    assert.ok(submit.indexOf('!firstResult.valid || !lastResult.valid') < submit.indexOf('await signUp('));
  });

  test('saving from Settings is online only: a server read before the write', () => {
    const save = actions.slice(actions.indexOf('export async function saveName'));
    assert.ok(save.indexOf('getDocFromServer(') < save.indexOf('updateDoc('));
  });
});

describe('the name stays out of the insight request, sync, Cloud Functions and the admin screens', () => {
  const CODE = /\.(ts|tsx|js|mjs)$/;
  const files = (path: string): string[] => {
    const full = join(ROOT, path);
    if (!existsSync(full)) return [];
    if (statSync(full).isFile()) return [full];
    return readdirSync(full).flatMap((name) => files(join(path, name))).filter((p) => CODE.test(p));
  };

  test('none of them mentions firstName, lastName, displayName or the stored copy', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/insights.ts'), ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'),
      ...files('utils/insightSchedule.ts'), ...files('services/admin.js'), ...files('services/adminAudit.js'),
      ...files('app/admin'),
    ];
    assert.ok(outbound.length > 15);
    for (const file of outbound) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /firstName|lastName|displayName|profile:name|profileName/,
        relative(ROOT, file));
    }
  });

  test('the name modules import nothing from the insight request or sync', () => {
    for (const file of ['utils/greeting.ts', 'utils/profileName.ts', 'services/profileName.ts', 'services/profileNameCore.ts']) {
      assert.doesNotMatch(source(file), /insight|@\/sync\/|firebase/, file);
    }
  });
});
