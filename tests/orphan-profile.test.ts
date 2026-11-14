// The orphan-account fix, parts (a) and (b) (docs/HABITQUEST_DESIGN.md): sign-up saves the profile details on the
// phone first and completes the users/{uid} profile later instead of deleting the account; "Finish setting up your
// account" asks for them only when the server says there is no profile and nothing on this phone can complete it.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';

const {createProfileCompletion, settleProfile} = await import('../services/profileCompletionCore.ts');
const P = await import('../utils/profilePending.ts');

const UID = 'uid-orphan';
const PROFILE = {age: 30, firstName: 'Amina', lastName: 'Otieno'};
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const coded = (code: string) => Object.assign(new Error(code), {code});

// A fake users/{uid} server: `docs` holds the uids with a profile; switches make it offline or refuse writes
function fakeServer() {
  const docs = new Set<string>();
  const calls: string[] = [];
  const s = {
    docs, calls,
    offline: false,
    createError: null as Error | null,
    landLate: false,// the write "times out" but lands on the server anyway
    async exists(uid: string) {
      calls.push('exists');
      if (s.offline) throw coded('unavailable');
      return docs.has(uid);
    },
    async create(uid: string) {
      calls.push('create');
      if (s.offline) throw coded('deadline-exceeded');
      if (s.landLate) {
        docs.add(uid);
        throw coded('deadline-exceeded');
      }
      if (s.createError) throw s.createError;
      if (docs.has(uid)) throw coded('permission-denied');// the rules: an existing doc can't be created again
      docs.add(uid);
    },
  };
  return s;
}

function setup(initial: Record<string, string> = {}) {
  const storage = Object.assign(kvStorage(initial), {
    removeItem: async (key: string) => {
      storage.data.delete(key);
    },
  });
  const server = fakeServer();
  return {storage, server, completion: createProfileCompletion({storage, server})};
}
const KEY = P.pendingProfileKey(UID);

describe('the completer', () => {
  test('the write lands on the first try: nothing stays pending', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    assert.equal(await completion.writeNow(UID, PROFILE), true);
    assert.ok(server.docs.has(UID));
    assert.equal(storage.data.has(KEY), false);
  });

  test('a timeout keeps it pending; the write landed late, so the next run reads it and doesn\'t write again', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.landLate = true;
    assert.equal(await completion.writeNow(UID, PROFILE), false);
    assert.ok(storage.data.has(KEY));
    server.landLate = false;
    server.calls.length = 0;
    assert.equal(await completion.complete(UID), 'done');
    assert.deepEqual(server.calls, ['exists']);
    assert.equal(storage.data.has(KEY), false);
  });

  test('offline: kept pending, nothing written; online later it completes', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.offline = true;
    assert.equal(await completion.writeNow(UID, PROFILE), false);
    assert.equal(await completion.complete(UID), 'waiting');
    assert.ok(storage.data.has(KEY));
    server.offline = false;
    assert.equal(await completion.complete(UID), 'done');
    assert.ok(server.docs.has(UID));
  });

  test('a permanent refusal hands over to the recovery screen and drops the pending record', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.createError = coded('permission-denied');
    assert.equal(await completion.complete(UID), 'refused');
    assert.equal(storage.data.has(KEY), false);
  });

  test('two phones racing: the second create is refused, a read shows the profile, so it is done', async () => {
    const {server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.docs.add(UID);// the other phone's write landed between this phone's read and its create
    assert.equal(await completion.complete(UID, {serverMissing: true}), 'done');
    assert.deepEqual(server.calls, ['create', 'exists']);
  });

  test('pending is per uid: another account signed in on the phone has nothing pending; the first one still completes', async () => {
    const {server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    assert.equal(await completion.complete('uid-other'), 'none');
    assert.equal(server.calls.length, 0);
    assert.equal(await completion.complete(UID), 'done');
  });

  test('R-1: a pending record that can\'t be read is never acted on; a corrupt one is dropped', async () => {
    const {storage, server, completion} = setup({[KEY]: P.serialisePendingProfile(PROFILE)});
    storage.failReads([KEY]);
    assert.equal(await completion.complete(UID), 'waiting');
    assert.deepEqual(server.calls, []);
    const corrupt = setup({[KEY]: '{"version":1,"age":12}'});
    assert.equal(await corrupt.completion.complete(UID), 'none');
    assert.equal(corrupt.storage.data.has(KEY), false);
  });

  test('two runs at once share one: one create', async () => {
    const {server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    const results = await Promise.all([completion.complete(UID), completion.complete(UID)]);
    assert.deepEqual(results, ['done', 'done']);
    assert.equal(server.calls.filter((c) => c === 'create').length, 1);
  });

  test('the record: written as {version: 1, age, firstName, lastName}; only valid sign-up values read back', () => {
    assert.deepEqual(JSON.parse(P.serialisePendingProfile(PROFILE)), {version: 1, ...PROFILE});
    assert.deepEqual(P.parsePendingProfile(P.serialisePendingProfile(PROFILE)), PROFILE);
    for (const bad of [null, '{oops', '[]', '{"version":2,"age":30,"firstName":"A","lastName":"B"}', '{"version":1,"age":17,"firstName":"A","lastName":"B"}']) {
      assert.equal(P.parsePendingProfile(bad), null, String(bad));
    }
  });
});

describe('sign-up', () => {
  const actions = source('services/authActions.js');
  const signUp = actions.slice(actions.indexOf('export async function signUp'), actions.indexOf('export async function saveName'));

  test('the details are saved on the phone first, right after the account exists; one write try; no rollback', () => {
    const at = (needle: string) => signUp.indexOf(needle);
    assert.ok(at('createUserWithEmailAndPassword(') < at('profileCompletion.savePending(uid, profile)'));
    assert.ok(at('profileCompletion.savePending(uid, profile)') < at('onboardingStore.markPending(uid)'));
    assert.ok(at('onboardingStore.markPending(uid)') < at('profileCompletion.writeNow(uid, profile)'));
    assert.equal(signUp.split('throw ').length - 1, 1, 'only an account that wasn\'t created fails sign-up');
    assert.doesNotMatch(signUp, /\.delete\(\)|profile-write-failed/);
    assert.doesNotMatch(source('app/auth.tsx'), /profile-write-failed/);
  });

  test('the profile write times out after 10 s', () => {
    assert.equal(P.PROFILE_WRITE_TIMEOUT_MS, 10_000);
    assert.match(source('services/profileCompletion.ts'), /\}\), PROFILE_WRITE_TIMEOUT_MS\);/);
  });

  test('killed after the details were saved: the next launch completes the profile', async () => {
    const {storage, server} = setup();
    await createProfileCompletion({storage, server}).savePending(UID, PROFILE);// then the app died
    const nextLaunch = createProfileCompletion({storage, server});
    assert.equal(await nextLaunch.complete(UID, {serverMissing: true}), 'done');
    assert.ok(server.docs.has(UID));
  });

  test('the completer runs off the startup path: from the account check and after sync cycles only', () => {
    const callers = (pattern: RegExp) => {
      const found: string[] = [];
      const root = new URL('../', import.meta.url);
      for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'sync']) {
        for (const entry of readdirSync(new URL(`${dir}/`, root), {recursive: true}) as string[]) {
          const path = `${dir}/${entry.replaceAll('\\', '/')}`;
          if (/\.(ts|tsx|js)$/.test(path) && pattern.test(source(path))) found.push(path);
        }
      }
      return found.sort();
    };
    assert.deepEqual(callers(/profileCompletion\.complete\(/), ['app/profile-setup.tsx']);
    assert.deepEqual(callers(/settleProfile\(profileCompletion/), ['services/useDisabledCheck.ts']);
    // useDisabledCheck runs only once network services start (after Home's first load), never at cold start
    assert.match(source('app/_layout.tsx'), /useDisabledCheck\(servicesUid\);/);
  });
});

describe('recovery', () => {
  test('opens only on a server-confirmed missing profile of a non-admin that nothing on this phone can complete', () => {
    assert.equal(P.needsProfileSetup('missing', false, 'none'), true);
    assert.equal(P.needsProfileSetup('missing', false, 'refused'), true);
    for (const c of ['done', 'waiting'] as const) assert.equal(P.needsProfileSetup('missing', false, c), false, c);
    for (const admin of [true, null]) {
      for (const c of ['done', 'none', 'waiting', 'refused'] as const) assert.equal(P.needsProfileSetup('missing', admin, c), false, `${admin} ${c}`);
    }
    for (const p of ['exists', 'unknown'] as const) {
      for (const c of ['done', 'none', 'waiting', 'refused'] as const) assert.equal(P.needsProfileSetup(p, false, c), false, `${p} ${c}`);
    }
    assert.deepEqual(
      [P.profileAction('exists', null), P.profileAction('missing', false), P.profileAction('missing', true), P.profileAction('missing', null), P.profileAction('unknown', null)],
      ['complete', 'complete', 'skip', 'skip', 'skip'],
    );
  });

  test('an admin with no profile never sees the screen, and a pending record of theirs is left alone', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.calls.length = 0;
    assert.equal(await settleProfile(completion, UID, {profile: 'missing', admin: true}), false);
    assert.deepEqual(server.calls, [], 'nothing completed or written');
    assert.ok(storage.data.has(KEY), 'the pending record is left alone');
    // and with nothing pending either
    assert.equal(await settleProfile(setup().completion, UID, {profile: 'missing', admin: true}), false);
  });

  test('a failed admin read (unknown) opens nothing and completes nothing', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.calls.length = 0;
    assert.equal(await settleProfile(completion, UID, {profile: 'missing', admin: null}), false);
    assert.deepEqual(server.calls, []);
    assert.ok(storage.data.has(KEY));
    assert.equal(await settleProfile(setup().completion, UID, {profile: 'missing', admin: null}), false);
  });

  test('a normal user with no profile and nothing pending still sees the screen; with a pending record it is completed instead', async () => {
    assert.equal(await settleProfile(setup().completion, UID, {profile: 'missing', admin: false}), true);
    const {server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    assert.equal(await settleProfile(completion, UID, {profile: 'missing', admin: false}), false);
    assert.ok(server.docs.has(UID));
    const refused = setup();
    await refused.completion.savePending(UID, PROFILE);
    refused.server.createError = coded('permission-denied');
    assert.equal(await settleProfile(refused.completion, UID, {profile: 'missing', admin: false}), true);
  });

  test('"missing" only from a successful server read; admins/{uid} is read only then; failures are unknown', () => {
    const status = source('services/accountStatus.js');
    const missing = status.slice(status.indexOf('if (!user.exists()) {'), status.indexOf('if (onProfile) {'));
    assert.match(missing, /const admin = await withTimeout\(getDocFromServer\(doc\(db, 'admins', uid\)\)\);\s*return \{status: 'ok', profile: 'missing', admin: admin\.exists\(\)\};/);
    assert.match(missing, /\} catch \{\s*return \{status: 'ok', profile: 'missing', admin: null\};/);
    // a normal user with a profile: no admins read before the answer
    const exists = status.slice(status.indexOf('if (onProfile) {'), status.indexOf("if (user.get('disabled') !== true)"));
    assert.doesNotMatch(exists, /admins/);
    assert.match(status, /if \(user\.get\('disabled'\) !== true\) return \{status: 'ok', profile: 'exists', admin: null\};/);
    assert.match(status, /\} catch \{\s*return \{status: 'unknown', profile: 'unknown', admin: null\};\s*\}/);
    const hook = source('services/useDisabledCheck.ts');
    assert.match(hook, /const openSetup = await settleProfile\(profileCompletion, uid, \{profile, admin\}\);\s*if \(current\(\) && openSetup && !profileSetupScreen\.isOpen\(\)\) \{/);
    assert.match(source('utils/profilePending.ts').replace(/\n\/\/ /g, ' '),
      /Phase F \(guest mode, not built\): a guest has no profile by design and must be exempt from this check/);
  });

  test('the approved copy', () => {
    assert.equal(P.SETUP_TITLE, 'Finish setting up your account');
    assert.equal(P.SETUP_BODY, "We couldn't save your details when you signed up. Add them to keep using HabitQuest.");
    assert.equal(P.SETUP_SAVE, 'Save and continue');
    assert.equal(P.SETUP_FAILED, "Couldn't save your details. Check your internet connection and try again.");
  });

  test('under 18: the existing message, nothing written, signed out, never deleted', () => {
    for (const age of ['15', '17', '0']) {
      assert.deepEqual(P.setupAgeOutcome(age), {kind: 'underAge', message: 'You must be at least 18 to use HabitQuest.'}, age);
    }
    assert.deepEqual(P.setupAgeOutcome('18'), {kind: 'ok', age: 18});
    for (const bad of ['', 'abc', '120', '17.5']) assert.deepEqual(P.setupAgeOutcome(bad), {kind: 'invalid'}, bad);
    const screen = source('app/profile-setup.tsx');
    const branch = screen.slice(screen.indexOf("if (ageOutcome.kind === 'underAge') {"), screen.indexOf('savingRef.current = true;'))
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');// code only, not its comment
    assert.match(branch, /await signOut\(\)/);
    assert.match(branch, /Alert\.alert\(ageOutcome\.message\);\s*return;/);
    assert.doesNotMatch(branch, /savePending|complete\(|setDoc|delete/);
    assert.ok(screen.indexOf("if (ageOutcome.kind === 'underAge')") < screen.indexOf('profileCompletion.savePending('));
  });

  test('the screen blocks (no back) and saves through the completer, showing the failure line otherwise', () => {
    const screen = source('app/profile-setup.tsx');
    assert.match(screen, /BackHandler\.addEventListener\('hardwareBackPress', \(\) => true\)/);
    assert.match(source('app/_layout.tsx'), /name="profile-setup" options=\{\{headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false\}\}/);
    assert.match(screen, /const result = await profileCompletion\.complete\(uid\);\s*if \(result !== 'done'\) \{\s*setStatus\('failed'\);/);
    assert.match(screen, /\{status === 'failed' && <Text style=\{styles\.failed\} accessibilityLiveRegion="polite">\{SETUP_FAILED\}<\/Text>\}/);
  });

  test('a profile that exists clears a pending record and opens nothing', async () => {
    const {storage, server, completion} = setup();
    await completion.savePending(UID, PROFILE);
    server.docs.add(UID);
    assert.equal(await settleProfile(completion, UID, {profile: 'exists', admin: null}), false);
    assert.equal(storage.data.has(KEY), false);
  });
});

describe('rollback (an older bundle)', () => {
  test('an older bundle never reads the pending record; when this bundle runs again it still completes', async () => {
    // only this build's files know the key
    const root = new URL('../', import.meta.url);
    const readers: string[] = [];
    for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'sync', 'db']) {
      for (const entry of readdirSync(new URL(`${dir}/`, root), {recursive: true}) as string[]) {
        const path = `${dir}/${entry.replaceAll('\\', '/')}`;
        if (/\.(ts|tsx|js)$/.test(path) && /profile:pending:v1/.test(source(path))) readers.push(path);
      }
    }
    assert.deepEqual(readers, ['utils/profilePending.ts']);
    // left pending while an older bundle ran (its own sign-up rollback is unchanged); back on this bundle
    const {server, completion} = setup({[KEY]: P.serialisePendingProfile(PROFILE)});
    assert.equal(await completion.complete(UID), 'done');
    assert.ok(server.docs.has(UID));
  });
});
