// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
// Runs the Meeting 3 database demo (scripts/db-demo.ts) as the supervisor will see it, without pauses, so a
// schema change that breaks the demo (an attempt no longer rejected, a 3NF check failing) fails npm test.
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function runDemo(...args: string[]) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/db-demo.ts', ...args, '--no-pause'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
}

const full = runDemo();

describe('db demo (scripts/db-demo.ts)', () => {
  test('the full run exits 0 and reports ALL GOOD', () => {
    assert.equal(full.status, 0, full.stdout + full.stderr);
    assert.match(full.stdout, /^ {2}Result: ALL GOOD$/m);
  });

  test('every integrity attempt is rejected by a constraint, after the valid controls are accepted', () => {
    assert.doesNotMatch(full.stdout, /NOT REJECTED|NOT A CONSTRAINT|CONTROL REJECTED/);
    const m = /Integrity attempts: (\d+) of (\d+) rejected/.exec(full.stdout);
    assert.ok(m, 'summary line present');
    assert.equal(m[1], m[2]);
    assert.ok(Number(m[2]) >= 21, `expected at least 21 attempts, got ${m[2]}`);
    assert.equal(full.stdout.match(/^ {2}REJECTED: /gm)?.length, Number(m[2]));
    assert.equal(full.stdout.match(/^ {2}ACCEPTED: /gm)?.length, 3);
  });

  test('the 3NF checks pass and the app-level frequency rule has 0 violations', () => {
    assert.doesNotMatch(full.stdout, /^ {2}FAIL /m);
    assert.match(full.stdout, /3NF checks: \d+ passed, \d+ argued in the 3NF document, 0 failed/);
    assert.match(full.stdout, /habits audited: 0 violations/);
    assert.match(full.stdout, /PASS {4}XP followed the row/);
    assert.match(full.stdout, /PASS {4}undoing the row restored every number exactly/);
  });

  test('every known gap is still a gap, and every file it names exists', () => {
    const gaps = full.stdout.slice(full.stdout.indexOf('Known gaps'));
    assert.equal(gaps.match(/GAP CONFIRMED/g)?.length, 6);
    assert.doesNotMatch(gaps, /NOW REJECTED/);
    const files = new Set(gaps.match(/\b(?:[a-z]+\/[\w-]+\.(?:ts|tsx|js)|firestore\.rules)\b/g));
    assert.ok(files.size >= 7, `expected the gap list to name files, got ${[...files].join(', ')}`);
    for (const file of files) assert.ok(existsSync(join(ROOT, file)), `${file} named in the gap list exists`);
  });

  test('every line fits a projector: under 100 characters', () => {
    const long = full.stdout.split(/\r?\n/).filter((line) => line.length >= 100);
    assert.deepEqual(long, []);
  });

  test('each section runs on its own and exits 0; an unknown section exits 2', () => {
    for (const [section, marker] of [
      ['schema', '1. SCHEMA'], ['data', '2. DATA'], ['3nf', '3. 3NF EVIDENCE'], ['integrity', '4. INTEGRITY'],
      ['summary', '5. SUMMARY'],
    ]) {
      const r = runDemo(section);
      assert.equal(r.status, 0, `${section}: ${r.stdout}${r.stderr}`);
      assert.ok(r.stdout.includes(marker), `${section} prints its heading`);
      assert.equal(r.stdout.match(/^={98}$/gm)?.length, 2, `${section} prints only its own section`);
    }
    assert.match(runDemo('summary').stdout, /Integrity attempts: (\d+) of \1 rejected/);
    assert.equal(runDemo('nonsense').status, 2);
  });
});
