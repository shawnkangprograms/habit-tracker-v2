// functions/scripts/backfill-stats.mjs: its pure day list, arguments, project check and read count
// (scripts/backfill-core.js), and a scan that the script writes nothing but stats/{day}. Run: cd functions && npm test
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const core = await import('../scripts/backfill-core.js');
const {refreshDays} = await import('../src/stats/aggregate.js');

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 10, 7);// Tue 10 Nov 2026, 10:00 Nairobi
const RC = {projects: {default: 'habit-tracker-v2-81e1c'}};

describe('backfillDays', () => {
  test('today (Nairobi) and the days before it, oldest first', () => {
    assert.deepEqual(core.backfillDays(3, NOW), ['2026-11-08', '2026-11-09', '2026-11-10']);
    assert.deepEqual(core.backfillDays(1, NOW), ['2026-11-10']);
  });

  test('the default 30 and the maximum 90, consecutive with no repeats', () => {
    for (const n of [core.DEFAULT_BACKFILL_DAYS, core.MAX_BACKFILL_DAYS]) {
      const days = core.backfillDays(n, NOW);
      assert.equal(days.length, n);
      assert.equal(new Set(days).size, n);
      assert.equal(days.at(-1), '2026-11-10');
      for (let i = 1; i < days.length; i++) {
        assert.equal(Date.parse(days[i]) - Date.parse(days[i - 1]), 24 * HOUR, days[i]);
      }
    }
    assert.equal(core.backfillDays(90, NOW)[0], '2026-08-13');
  });

  test('Nairobi date, not UTC, between 00:00 and 03:00', () => {
    assert.equal(core.backfillDays(1, Date.UTC(2026, 10, 9, 22, 30)).at(-1), '2026-11-10');// 01:30 Nairobi
  });

  test('across a month, a year end and a leap day', () => {
    assert.deepEqual(core.backfillDays(3, Date.UTC(2027, 0, 1, 7)), ['2026-12-30', '2026-12-31', '2027-01-01']);
    assert.deepEqual(core.backfillDays(2, Date.UTC(2028, 2, 1, 7)), ['2028-02-29', '2028-03-01']);
  });

  test('the same days refreshStats computes, for every count it accepts', () => {
    for (let n = 1; n <= 30; n++) assert.deepEqual(core.backfillDays(n, NOW), refreshDays(n, NOW), String(n));
  });
});

describe('parseBackfillArgs and checkProject', () => {
  test('defaults to 30 days; --days 1..90', () => {
    assert.deepEqual(core.parseBackfillArgs(['--project', 'p']), {project: 'p', days: 30});
    assert.equal(core.parseBackfillArgs(['--days', '90', '--project', 'p']).days, 90);
    assert.equal(core.parseBackfillArgs(['--days', '1']).days, 1);
  });

  test('refuses bad options', () => {
    for (const argv of [['--days', '0'], ['--days', '91'], ['--days', '7.5'], ['--days', '-3'], ['--days', 'ten'],
      ['--days'], ['--project'], ['--project', '--days', '5'], ['--force'], ['stats']]) {
      assert.throws(() => core.parseBackfillArgs(argv), Error, argv.join(' '));
    }
  });

  test('refuses a missing or different project, and a .firebaserc without one', () => {
    assert.doesNotThrow(() => core.checkProject('habit-tracker-v2-81e1c', RC));
    assert.throws(() => core.checkProject(null, RC), /--project is required/);
    assert.throws(() => core.checkProject('habit-tracker-v2-81e1c-old', RC), /not this repo's project/);
    assert.throws(() => core.checkProject('x', {}), /no default project/);
  });

  test('the real .firebaserc is what the script checks against', () => {
    const rc = JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8'));
    assert.doesNotThrow(() => core.checkProject(rc.projects.default, rc));
  });
});

describe('billedReads', () => {
  test('documents returned, one minimum per empty query, every getAll document', () => {
    assert.equal(core.billedReads({users: 10, habits: 40, completions: 170, aiUsage: 6, aiUsageDaily: 30}), 256);
    assert.equal(core.billedReads({users: 0, habits: 0, completions: 0, aiUsage: 0, aiUsageDaily: 30}), 34);
  });
});

describe('backfill-stats.mjs writes nothing but stats/{day}', () => {
  const source = readFileSync(new URL('../scripts/backfill-stats.mjs', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');// comments out

  test('one collection, one kind of write', () => {
    assert.deepEqual(source.match(/collection\([^)]*\)/g), ['collection(STATS)']);
    assert.match(source, /const STATS = 'stats';/);
    assert.equal((source.match(/\.set\(/g) ?? []).length, 1);
    assert.match(source, /batch\.set\(db\.collection\(STATS\)\.doc\(day\)/);
    for (const call of ['.update(', '.delete(', '.create(', 'recursiveDelete', 'bulkWriter', 'runTransaction', 'collectionGroup', '.add(']) {
      assert.equal(source.includes(call), false, call);
    }
  });

  test('the only other Firestore traffic is the shared read-only loader', async () => {
    const loader = readFileSync(new URL('../src/stats/load.js', import.meta.url), 'utf8');
    for (const call of ['.set(', '.update(', '.delete(', '.create(', 'batch(', 'bulkWriter', '.add(']) {
      assert.equal(loader.includes(call), false, `load.js ${call}`);
    }
  });
});
