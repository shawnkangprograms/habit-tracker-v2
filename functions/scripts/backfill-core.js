// Pure parts of backfill-stats.mjs: arguments, the project check and the day list. No Firebase, no clock.

import {addDays, nairobiDateOf} from '../src/stats/aggregate.js';

export const DEFAULT_BACKFILL_DAYS = 30;
export const MAX_BACKFILL_DAYS = 90;

// argv (without node and the script) -> {project, days}. Throws a plain message on anything unexpected.
export function parseBackfillArgs(argv) {
  const args = {project: null, days: DEFAULT_BACKFILL_DAYS};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--project') args.project = value();
    else if (a === '--days') {
      const raw = value();
      if (!/^\d+$/.test(raw)) throw new Error('--days must be a whole number');
      args.days = Number(raw);
    } else throw new Error(`Unknown option ${a}`);
  }
  if (args.days < 1 || args.days > MAX_BACKFILL_DAYS) throw new Error(`--days must be 1..${MAX_BACKFILL_DAYS}`);
  return args;
}

// The project must be named and match the repo's .firebaserc default (the parsed file's object)
export function checkProject(project, firebaserc) {
  const expected = firebaserc?.projects?.default;
  if (!project) throw new Error('--project is required');
  if (typeof expected !== 'string' || expected.length === 0) throw new Error('.firebaserc has no default project');
  if (project !== expected) throw new Error(`--project ${project} is not this repo's project (${expected})`);
}

// Today (Nairobi) and the days before it, `days` in all, oldest first: the same days refreshStats would compute
export function backfillDays(days, nowMs) {
  const today = nairobiDateOf(nowMs);
  return Array.from({length: days}, (_, i) => addDays(today, i - days + 1));
}

// Firestore reads billed for one load (load.js readCounts): every document returned, and at least one read for
// each query that returned none (getAll bills each requested document, found or not)
export function billedReads(readCounts) {
  const query = (n) => Math.max(n, 1);
  return query(readCounts.users) + query(readCounts.habits) + query(readCounts.completions)
    + query(readCounts.aiUsage) + readCounts.aiUsageDaily;
}
