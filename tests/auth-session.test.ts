// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  confirmedUid, createEndSession, INITIAL_SESSION, nextSession, sessionKnown, shownUid, type AuthSession,
} from '../utils/authSession.ts';

const run = (...events: Parameters<typeof nextSession>[1][]): AuthSession => events.reduce(nextSession, INITIAL_SESSION);

describe('auth session (fix #1)', () => {
  test('marker then the same uid from Firebase: presumed, then confirmed; only confirmed starts network work', () => {
    const presumed = run({type: 'markerRead', uid: 'A'});
    assert.deepEqual(presumed, {kind: 'presumed', uid: 'A'});
    assert.equal(sessionKnown(presumed), true);// the gate may open
    assert.equal(shownUid(presumed), 'A');
    assert.equal(confirmedUid(presumed), null);// no sync, admin or disabled check yet
    const confirmed = nextSession(presumed, {type: 'callback', uid: 'A'});
    assert.equal(shownUid(confirmed), 'A');
    assert.equal(confirmedUid(confirmed), 'A');
  });

  test('marker then no user from Firebase (session revoked): signed out, nothing shown', () => {
    const state = run({type: 'markerRead', uid: 'A'}, {type: 'callback', uid: null});
    assert.deepEqual(state, {kind: 'signedOut'});
    assert.equal(shownUid(state), null);
  });

  test('marker then another uid from Firebase: the callback wins', () => {
    const state = run({type: 'markerRead', uid: 'A'}, {type: 'callback', uid: 'B'});
    assert.equal(shownUid(state), 'B');
    assert.equal(confirmedUid(state), 'B');
  });

  test('Firebase answered before the marker was read: a late marker changes nothing', () => {
    assert.deepEqual(run({type: 'callback', uid: 'A'}, {type: 'markerRead', uid: 'B'}), {kind: 'confirmed', uid: 'A'});
    assert.deepEqual(run({type: 'callback', uid: null}, {type: 'markerRead', uid: 'A'}), {kind: 'signedOut'});
  });

  test('no marker (fresh install, signed out, or a failed read): unknown until Firebase answers', () => {
    const state = run({type: 'markerRead', uid: null});
    assert.deepEqual(state, INITIAL_SESSION);
    assert.equal(sessionKnown(state), false);// the splash stays, as before fix #1
    assert.equal(shownUid(state), null);
  });

  test('sign-out after a confirmed session shows nothing; the next sign-in shows only the new user', () => {
    const state = run({type: 'markerRead', uid: 'A'}, {type: 'callback', uid: 'A'}, {type: 'callback', uid: null}, {type: 'callback', uid: 'B'});
    assert.equal(shownUid(state), 'B');
  });
});

describe('endSession: the one way to sign out', () => {
  test('clears the marker BEFORE ending the session', async () => {
    const calls: string[] = [];
    const endSession = createEndSession({clearMarker: async () => { calls.push('clear'); }});
    const result = await endSession(async () => { calls.push('signOut'); return 'done'; });
    assert.deepEqual(calls, ['clear', 'signOut']);
    assert.equal(result, 'done');
  });

  test('a failed clear refuses the sign-out and throws (the next launch must never presume this account)', async () => {
    let signedOut = false;
    const endSession = createEndSession({clearMarker: async () => { throw new Error('storage'); }});
    await assert.rejects(endSession(async () => { signedOut = true; }), /storage/);
    assert.equal(signedOut, false);
  });

  test('the sign-up rollback still deletes the account when the clear fails', async () => {
    let deleted = false;
    const endSession = createEndSession({clearMarker: async () => { throw new Error('storage'); }});
    await endSession(async () => { deleted = true; }, {proceedIfMarkerClearFails: true});
    assert.equal(deleted, true);
  });

  // Source check: every way the app can end a Firebase session goes through endSession
  test('nothing in the app signs out or deletes a user outside endSession', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(js|jsx|ts|tsx)$/.test(name)) files.push(path);
      }
    };
    for (const dir of ['app', 'components', 'constants', 'db', 'hooks', 'services', 'sync', 'utils', 'validation']) walk(join(root, dir));

    const SIGN_OUT_CALL = /\b(firebaseSignOut|signOut|deleteUser)\s*\(|\.signOut\s*\(|\.user\.delete\s*\(|currentUser\??\.delete\s*\(/;
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(root, file).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!SIGN_OUT_CALL.test(code)) return;
        if (code.includes('endSession(')) return;// the call is wrapped
        if (/(^|[^.\w])signOut\s*\(\s*\)/.test(code)) return;// the app's own signOut (it wraps), never auth.signOut()
        if (/function\s+signOut\s*\(/.test(code)) return;// its definition
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
      // only authActions may import Firebase's sign-out or user deletion
      if (rel !== 'services/authActions.js' && /from 'firebase\/auth'/.test(lines.join('\n'))
        && /\b(signOut|deleteUser)\b[^;]*from 'firebase\/auth'/s.test(lines.join('\n'))) {
        offenders.push(`${rel}: imports signOut or deleteUser from firebase/auth`);
      }
    }
    assert.deepEqual(offenders, []);
    // and the scan really sees the two wrapped calls (sign-out and the sign-up rollback)
    const actions = readFileSync(join(root, 'services/authActions.js'), 'utf8');
    assert.match(actions, /endSession\(\(\) => firebaseSignOut\(auth\)\)/);
    assert.match(actions, /endSession\(\(\) => userCredential\.user\.delete\(\)/);
  });
});
