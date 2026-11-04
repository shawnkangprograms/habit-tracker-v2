// Habit packs stay on the phone (docs/PACKS_REPORTS_SPEC.md, section 7). ESLint blocks static imports
// (eslint.config.js); this also catches require() and import() calls, keeps the pure logic pure, and checks the
// other direction: sync, the database layer, the insight request, the Cloud Functions and the admin screens
// never mention packs.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CODE = /\.(ts|tsx|js|mjs)$/;

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name))).filter((p) => CODE.test(p));
}

const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');

// Every module specifier: import ... from 'x', import 'x', export ... from 'x', require('x'), import('x')
function specifiers(source: string): string[] {
  const re = /(?:\bfrom\s+|\bimport\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

const PACK_FILES = [
  ...files('utils/packs'),
  ...files('services/packsStore.ts'),
  ...files('services/packsStoreCore.ts'),
  ...files('components/packs'),
  ...files('hooks/use-packs.ts'),
  ...files('app/packs'),
];

const FORBIDDEN = [
  /^firebase($|\/)/, /^@firebase\//, /^@\/sync\//, /^@\/db\/sync(Core)?$/,
  /^@\/services\/(firestore|firebaseInit|insights|insightCache|authMarker|authInit)$/, /^@\/utils\/insightInput$/,
];

describe('pack modules', () => {
  test('exist, and import nothing that reaches Firebase, sync, the insight request or the startup path', () => {
    assert.ok(PACK_FILES.length >= 9, 'expected the utils/packs modules and the store');
    for (const file of PACK_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the pure logic in utils/packs imports only pure modules', () => {
    const allowed = /^(@\/utils\/(packs|onboarding)\/\w+|@\/validation\/validators|@\/constants\/habits)$/;
    for (const file of files('utils/packs')) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) assert.match(spec, allowed, `${rel(file)} imports ${spec}`);
    }
  });

  test('the ESLint block covers every pack folder', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    for (const glob of ["'utils/packs/**'", "'services/packsStore*.ts'", "'components/packs/**'", "'hooks/use-packs.ts'", "'app/packs/**'"]) {
      assert.ok(config.includes(glob), glob);
    }
  });
});

describe('sync, the database, the insight request, the Cloud Functions and the admin screens', () => {
  test('never mention packs', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/firestore.js'), ...files('services/firebaseInit.js'), ...files('services/insights.ts'),
      ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'), ...files('utils/insightSchedule.ts'),
      ...files('services/admin.js'), ...files('services/adminAudit.js'), ...files('app/admin'),
    ];
    assert.ok(outbound.length > 15);
    for (const file of outbound) assert.doesNotMatch(readFileSync(file, 'utf8'), /\bpacks?\b|packsStore|utils\/packs/i, rel(file));
  });

  test('the insight function rejects a request carrying a packs field', async () => {
    const {validateInput} = await import('../functions/src/validateInput.js');
    const request = {
      v: 1, trackedDays: 10, streak: 2, bestWeekday: 'mon',
      habits: [{icon: 'water', freq: 'daily', daysPerWeek: 7, done: 5, scheduled: 10}],
    };
    assert.equal(validateInput(request).ok, true);
    assert.equal(validateInput({...request, packs: [{name: 'Calm Mind'}]}).ok, false);
  });
});
