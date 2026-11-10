// Text-level guards on firestore.rules for the admin stats step. NOT a rules evaluation: the repo has no emulator
// harness yet, so these only pin the exact lines; the behaviour tests are listed for the Phase 4 emulator suite.
// Run: cd functions && npm test
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

// The body of the first `allow <kind>:` rule inside `match /<path> {`, up to its closing semicolon
function allowRule(path: string, kind: string, nth = 0): string {
  const start = rules.indexOf(`match ${path} {`);
  assert.ok(start >= 0, `match ${path}`);
  let at = start;
  for (let i = 0; i <= nth; i++) {
    at = rules.indexOf(`allow ${kind}:`, at + 1);
    assert.ok(at >= 0, `allow ${kind} #${i} in ${path}`);
  }
  return rules.slice(at, rules.indexOf(';', at));
}

describe('firestore.rules: test accounts and stats', () => {
  test('LF line endings only', () => {
    assert.equal(rules.includes('\r'), false);
  });

  test('a client can never create a users doc with a test field (only the Admin SDK sets it)', () => {
    const create = allowRule('/users/{userId}', 'create');
    const keys = create.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/);
    assert.ok(keys, 'create has a keys().hasOnly list');
    assert.deepEqual(keys[1].split(',').map((k) => k.trim().replace(/'/g, '')).sort(), ['age', 'createdAt', 'firstName', 'lastName']);
  });

  test('the owner\'s update keeps test exactly as it was (cannot add, change or remove it)', () => {
    const update = allowRule('/users/{userId}', 'update', 0);
    assert.match(update, /hasOnly\(\[[^\]]*'test'[^\]]*\]\)/);
    assert.match(update, /request\.resource\.data\.get\('test', false\) == resource\.data\.get\('test', false\)/);
  });

  test('the admin update may change only disabled (so never test)', () => {
    const adminUpdate = allowRule('/users/{userId}', 'update', 1);
    assert.match(adminUpdate, /affectedKeys\(\)\.hasOnly\(\['disabled'\]\)/);
  });

  test('stats: admins read, nobody writes; statsMeta closed to every client', () => {
    assert.match(allowRule('/stats/{day}', 'read'), /^allow read: if isAdmin\(\)$/);
    assert.match(allowRule('/stats/{day}', 'write'), /^allow write: if false$/);
    assert.match(allowRule('/statsMeta/{docId}', 'read, write'), /^allow read, write: if false$/);
  });
});
