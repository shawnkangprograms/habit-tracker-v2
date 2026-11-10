// Recomputes stats/{YYYY-MM-DD} for today and the days before it, from your PC, with the same loader and
// aggregate the Cloud Functions use (functions/src/stats). Writes ONLY stats/{day} documents, merged exactly as
// refreshStats writes them (keys that can't be measured for old days, like "opened the app", keep any earlier value).
//
// Usage (PowerShell, from the repo root):
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\habit-tracker-v2-admin.json"   # service account key, never in the repo
//   node functions/scripts/backfill-stats.mjs --project habit-tracker-v2-81e1c --days 30
// Options: --project (required, must match .firebaserc), --days 1..90 (default 30).

import {readFileSync} from 'node:fs';
import {applicationDefault, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {computeDayStats} from '../src/stats/aggregate.js';
import {loadStatsInput} from '../src/stats/load.js';
import {backfillDays, billedReads, checkProject, parseBackfillArgs} from './backfill-core.js';

const STATS = 'stats';// the only collection this script writes

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  checkProject(args.project, JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8')));
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file first (see the header)');
  }

  initializeApp({credential: applicationDefault(), projectId: args.project});
  const db = getFirestore();
  const days = backfillDays(args.days, Date.now());
  console.log(`Project ${args.project}: recomputing ${days.length} day(s), ${days[0]} to ${days.at(-1)}`);

  const startedAt = Date.now();
  const input = await loadStatsInput({db, auth: getAuth()}, days);
  const now = Date.now();

  const batch = db.batch();// at most 90 writes, well under the 500-write batch limit
  for (const day of days) {
    batch.set(db.collection(STATS).doc(day), {
      ...computeDayStats(input, day, now),
      computedAt: FieldValue.serverTimestamp(),
      trigger: 'backfill',
    }, {merge: true});
  }
  await batch.commit();

  const r = input.readCounts;
  console.log(`Reads used: about ${billedReads(r)} (users ${r.users}, habits ${r.habits}, completions ${r.completions}, `
    + `aiUsage ${r.aiUsage}, aiUsageDaily ${r.aiUsageDaily}); Auth accounts listed: ${input.authUsers.length} (not Firestore reads)`);
  console.log(`Days written: ${days.length} (stats/${days[0]} .. stats/${days.at(-1)}) in ${Date.now() - startedAt} ms`);
}

try {
  await main();
} catch (err) {
  console.error(`backfill-stats: ${err?.message ?? err}`);
  process.exitCode = 1;
}
