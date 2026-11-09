// S-1: the one sync message the app shows (utils/syncStatusLine.ts) and where it may appear: Settings only, never Home
// or the startup path (docs/HABITQUEST_DESIGN.md, S-1). Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const {clockLine, CLOCK_LINE} = await import('../utils/syncStatusLine.ts');
const ROOT = fileURLToPath(new URL('../', import.meta.url));

describe('the clock line', () => {
  test('hidden below two suspect cycles, the exact approved copy from two on', () => {
    assert.equal(CLOCK_LINE, 'Backup paused: your phone\'s date and time look wrong. Set them to automatic and your changes will back up.');
    for (const cycles of [0, 1]) assert.equal(clockLine({clockSuspectCycles: cycles}), null);
    for (const cycles of [2, 5]) assert.equal(clockLine({clockSuspectCycles: cycles}), CLOCK_LINE);
    assert.equal(clockLine(null), null);
    assert.equal(clockLine({}), null);// a status from before S-1
  });

  test('only Settings shows it: nothing on the Home or startup path reads the clock-suspect state', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js)$/.test(name)) files.push(relative(ROOT, path).replace(/\\/g, '/'));
      }
    };
    for (const dir of ['app', 'components', 'hooks', 'services', 'utils', 'sync', 'db']) walk(join(ROOT, dir));
    const users = files.filter((f) => /clockLine|use-clock-line|useClockLine|clockSuspect|syncStatusLine/.test(readFileSync(join(ROOT, f), 'utf8'))).sort();
    assert.deepEqual(users, ['app/(tabs)/settings.tsx', 'hooks/use-clock-line.ts', 'sync/engineCore.ts', 'utils/syncStatusLine.ts']);
  });
});
