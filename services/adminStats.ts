// Admin Stats screen I/O: the stats/{day} documents (admins only; the rules are the real guard) and the
// refreshStats callable (functions/index.js). The shaping lives in utils/adminStats.ts.
//
// One query reads the whole 90-day maximum (at most 90 small documents), so switching between 7, 30 and 90 days
// never reads again. firebase/functions is required on first use, as in services/insights.ts (the ESLint rule).

import {getApp} from 'firebase/app';
import type {HttpsCallable} from 'firebase/functions';
import {firestore} from '@/services/firestore';
import {getFirestoreDb} from '@/services/firebaseInit';
import {getFirebaseAuth} from '@/services/authInit';
import {withTimeout} from '@/services/admin';
import {MAX_RANGE, nairobiToday, rangeDates, type StatsDoc} from '@/utils/adminStats';

const REGION = 'africa-south1';// functions/src/stats/config.js STATS_CALLABLE_REGION
const REFRESH_TIMEOUT_MS = 90000;// the function itself stops at 120 s

export async function getStatsDocs(nowMs: number = Date.now()): Promise<StatsDoc[]> {
  const {collection, getDocsFromServer, query, where} = firestore();
  const dates = rangeDates(nairobiToday(nowMs), MAX_RANGE);
  const q = query(collection(getFirestoreDb(), 'stats'), where('day', '>=', dates[0]), where('day', '<=', dates.at(-1)!));
  const snap: Awaited<ReturnType<typeof getDocsFromServer>> = await withTimeout(getDocsFromServer(q));
  return snap.docs.map((d) => {
    const computedAt = d.get('computedAt');
    return {
      day: d.id,
      all: d.get('all'),
      real: d.get('real'),
      computedAtMs: computedAt && typeof computedAt.toMillis === 'function' ? computedAt.toMillis() : null,
    };
  });
}

let callable: HttpsCallable<{days: number}, unknown> | null = null;

// Recomputes today's document. Throws the callable's error (code 'functions/resource-exhausted' when refused).
export async function refreshTodayStats(): Promise<void> {
  if (!callable) {
    getFirebaseAuth();// the app and Auth exist, so the call carries the admin's token
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose (see above)
    const sdk: typeof import('firebase/functions') = require('firebase/functions');
    callable = sdk.httpsCallable<{days: number}, unknown>(sdk.getFunctions(getApp(), REGION), 'refreshStats', {timeout: REFRESH_TIMEOUT_MS});
  }
  await callable({days: 1});
}
