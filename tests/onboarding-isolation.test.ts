// Onboarding answers never leave the phone (docs/ONBOARDING_SPEC.md, section 2). ESLint blocks static imports
// (eslint.config.js); this also catches require() and import() calls, and checks the other direction: sync,
// the database layer, the insight request and the Cloud Functions never mention onboarding.
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

const ONBOARDING_FILES = [
  ...files('utils/onboarding'),
  ...files('components/onboarding'),
  ...files('app/onboarding'),
  ...files('app/onboarding.tsx'),
  ...files('services/onboardingStore.ts'),
  ...files('services/onboardingStoreCore.ts'),
  ...files('services/onboardingLaunch.ts'),
  ...files('services/reminderPermission.ts'),
  ...files('hooks/use-onboarding-gate.ts'),
];

const FORBIDDEN = [
  /^firebase($|\/)/, /^@firebase\//, /^@\/sync\//, /^@\/db\/sync(Core)?$/,
  /^@\/services\/(firestore|firebaseInit|insights|insightCache)$/, /^@\/utils\/insightInput$/,
];

describe('onboarding modules', () => {
  test('exist, and import nothing that reaches Firebase, sync or the insight request', () => {
    assert.ok(ONBOARDING_FILES.length >= 6, 'expected the utils/onboarding modules');
    for (const file of ONBOARDING_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the pure logic in utils/onboarding imports only pure modules', () => {
    const allowed = /^(@\/utils\/(onboarding|packs)\/[\w]+|@\/validation\/validators|@\/constants\/habits)$/;
    for (const file of files('utils/onboarding')) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) assert.match(spec, allowed, `${rel(file)} imports ${spec}`);
    }
  });
});

describe('sync, the database, the insight request and the Cloud Functions', () => {
  test('never mention onboarding', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/firestore.js'), ...files('services/firebaseInit.js'), ...files('services/insights.ts'),
      ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'), ...files('utils/insightSchedule.ts'),
    ];
    assert.ok(outbound.length > 10);
    for (const file of outbound) assert.doesNotMatch(readFileSync(file, 'utf8'), /onboarding/i, rel(file));
  });

  test('the insight function rejects a request carrying any extra field', async () => {
    const {validateInput} = await import('../functions/src/validateInput.js');
    const request = {
      v: 1, trackedDays: 10, streak: 2, bestWeekday: 'mon',
      habits: [{icon: 'water', freq: 'daily', daysPerWeek: 7, done: 5, scheduled: 10}],
    };
    assert.equal(validateInput(request).ok, true);
    assert.equal(validateInput({...request, onboarding: {focus: ['health']}}).ok, false);
  });
});
