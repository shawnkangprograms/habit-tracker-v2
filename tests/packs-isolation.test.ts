// Habit packs and reflections stay on the phone (docs/PACKS_REPORTS_SPEC.md, sections 7 and 12). ESLint blocks
// static imports (eslint.config.js); this also catches require() and import() calls, keeps the pure logic pure, and
// checks the other direction: sync, the database layer, the insight request, the Cloud Functions and the admin
// screens never mention packs or reflections. Reflections are not sent anywhere in Stage 3; Stage 9 adds one
// audited export path for them, and this test will then allow exactly that module.
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
  ...files('services/packLimits.ts'),
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
    assert.ok(PACK_FILES.length >= 18, 'expected the utils/packs modules, the store, the limits service, the hook, the components and the pack screens');
    for (const file of ['utils/packs/home.ts', 'utils/packs/picker.ts', 'utils/packs/manage.ts', 'hooks/use-packs.ts',
      'components/packs/pack-card.tsx', 'components/packs/choose-packs-card.tsx', 'app/packs/choose.tsx', 'app/packs/edit.tsx',
      'services/packLimits.ts']) {
      assert.ok(PACK_FILES.map(rel).includes(file), `${file} is scanned`);
    }
    for (const file of PACK_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the pure logic in utils/packs imports only pure modules', () => {
    const allowed = /^(@\/utils\/(packs|onboarding)\/\w+|@\/utils\/unknownFields|@\/validation\/validators|@\/constants\/habits)$/;
    for (const file of files('utils/packs')) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) assert.match(spec, allowed, `${rel(file)} imports ${spec}`);
    }
  });

  test('the ESLint block covers every pack folder', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    for (const glob of ["'utils/packs/**'", "'services/packsStore*.ts'", "'services/packLimits.ts'", "'components/packs/**'", "'hooks/use-packs.ts'", "'app/packs/**'"]) {
      assert.ok(config.includes(glob), glob);
    }
  });
});

const REFLECTION_FILES = [
  ...files('utils/reflections'),
  ...files('services/reflectionsStore.ts'),
  ...files('services/reflectionsStoreCore.ts'),
  ...files('services/gamificationStats.ts'),
  ...files('components/reflections'),
  ...files('hooks/use-reflection-bar.ts'),
  ...files('app/reflect.tsx'),
];

describe('reflection modules (not sent anywhere in Stage 3)', () => {
  test('exist, and import nothing that reaches Firebase, sync, the insight request or the startup path', () => {
    for (const file of ['utils/reflections/record.ts', 'utils/reflections/rewards.ts', 'utils/reflections/bar.ts',
      'utils/reflections/questions.ts', 'utils/reflections/copy.ts', 'services/reflectionsStoreCore.ts',
      'services/reflectionsStore.ts', 'services/gamificationStats.ts', 'components/reflections/reflection-bar.tsx',
      'hooks/use-reflection-bar.ts', 'app/reflect.tsx']) {
      assert.ok(REFLECTION_FILES.map(rel).includes(file), `${file} is scanned`);
    }
    for (const file of REFLECTION_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the pure logic in utils/reflections imports only pure modules', () => {
    const allowed = /^@\/utils\/(reflections\/\w+|gamification|unknownFields)$/;
    for (const file of files('utils/reflections')) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) assert.match(spec, allowed, `${rel(file)} imports ${spec}`);
    }
  });

  test('the ESLint block covers every reflection file', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    for (const glob of ["'utils/reflections/**'", "'services/reflectionsStore*.ts'", "'services/gamificationStats.ts'",
      "'components/reflections/**'", "'hooks/use-reflection-bar.ts'", "'app/reflect.tsx'"]) {
      assert.ok(config.includes(glob), glob);
    }
  });
});

const VITALITY_FILES = [...files('utils/vitality.ts'), ...files('utils/dailyCompletion.ts'), ...files('components/vitality-bar.tsx')];

describe('Vitality modules (on-device only, Stage 4)', () => {
  test('exist, are covered by the ESLint block, and import nothing that reaches Firebase, sync or the network', () => {
    assert.deepEqual(VITALITY_FILES.map(rel).sort(), ['components/vitality-bar.tsx', 'utils/dailyCompletion.ts', 'utils/vitality.ts']);
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    for (const glob of ["'utils/vitality.ts'", "'utils/dailyCompletion.ts'", "'components/vitality-bar.tsx'"]) assert.ok(config.includes(glob), glob);
    for (const file of VITALITY_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the maths imports only pure modules', () => {
    for (const file of [...files('utils/vitality.ts'), ...files('utils/dailyCompletion.ts')]) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.match(spec, /^@\/utils\/(gamification|dailyCompletion)$/, `${rel(file)} imports ${spec}`);
      }
    }
  });
});

const RADAR_FILES = [
  ...files('utils/radar'), ...files('services/areasStore.ts'), ...files('services/areasStoreCore.ts'),
  ...files('services/profileOutlineStore.ts'), ...files('services/profileOutlineStoreCore.ts'),
  ...files('components/radar'), ...files('hooks/use-radar-window.ts'), ...files('utils/appStats.ts'),
];

describe('radar modules (on-device only, Stage 5)', () => {
  test('exist, are covered by the ESLint block, and import nothing that reaches Firebase, sync or the network', () => {
    for (const file of ['utils/radar/areas.ts', 'utils/radar/score.ts', 'utils/radar/copy.ts', 'services/areasStoreCore.ts',
      'services/areasStore.ts', 'services/profileOutlineStoreCore.ts', 'services/profileOutlineStore.ts',
      'components/radar/radar-drawing.tsx', 'components/radar/radar-card.tsx', 'components/radar/radar-summary.tsx',
      'components/radar/window-switch.tsx', 'hooks/use-radar-window.ts', 'utils/appStats.ts']) {
      assert.ok(RADAR_FILES.map(rel).includes(file), `${file} is scanned`);
    }
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    for (const glob of ["'utils/radar/**'", "'services/areasStore*.ts'", "'services/profileOutline*.ts'", "'components/radar/**'",
      "'hooks/use-radar-window.ts'", "'utils/appStats.ts'"]) {
      assert.ok(config.includes(glob), glob);
    }
    for (const file of RADAR_FILES) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        assert.ok(!FORBIDDEN.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`);
      }
    }
  });

  test('the maths in utils/radar imports only pure modules', () => {
    const allowed = /^@\/utils\/(radar\/\w+|packs\/(manage|record)|onboarding\/(types|radar)|gamification|dailyCompletion)$/;
    for (const file of files('utils/radar')) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) assert.match(spec, allowed, `${rel(file)} imports ${spec}`);
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

  test('never mention reflections', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/firestore.js'), ...files('services/firebaseInit.js'), ...files('services/insights.ts'),
      ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'), ...files('utils/insightSchedule.ts'),
      ...files('services/admin.js'), ...files('services/adminAudit.js'), ...files('app/admin'),
    ];
    assert.ok(outbound.length > 15);
    for (const file of outbound) assert.doesNotMatch(readFileSync(file, 'utf8'), /reflection/i, rel(file));
  });

  test('never mention Vitality', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/firestore.js'), ...files('services/firebaseInit.js'), ...files('services/insights.ts'),
      ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'), ...files('utils/insightSchedule.ts'),
      ...files('services/admin.js'), ...files('services/adminAudit.js'), ...files('app/admin'),
    ];
    assert.ok(outbound.length > 15);
    for (const file of outbound) assert.doesNotMatch(readFileSync(file, 'utf8'), /vitality|dailyCompletion/i, rel(file));
  });

  test('never mention the radar, its areas map or the starting outline', () => {
    const outbound = [
      ...files('sync'), ...files('db'), ...files('functions/src'), ...files('functions/index.js'),
      ...files('services/firestore.js'), ...files('services/firebaseInit.js'), ...files('services/insights.ts'),
      ...files('services/insightCache.ts'), ...files('utils/insightInput.ts'), ...files('utils/insightSchedule.ts'),
      ...files('services/admin.js'), ...files('services/adminAudit.js'), ...files('app/admin'),
    ];
    assert.ok(outbound.length > 15);
    for (const file of outbound) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /utils\/radar|areasStore|areas:v1|profile:outline|profileOutline/, rel(file));
    }
  });

  test('the insight function rejects a request carrying a reflections field', async () => {
    const {validateInput} = await import('../functions/src/validateInput.js');
    const request = {
      v: 1, trackedDays: 10, streak: 2, bestWeekday: 'mon',
      habits: [{icon: 'water', freq: 'daily', daysPerWeek: 7, done: 5, scheduled: 10}],
    };
    assert.equal(validateInput(request).ok, true);
    assert.equal(validateInput({...request, reflections: [{feel: 'easy'}]}).ok, false);
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
