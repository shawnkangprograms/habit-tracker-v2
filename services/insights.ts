// App wiring for the Home insight card: the cache in AsyncStorage, the request built from local rows, and the
// generateInsight callable (functions/index.js). The decisions live in utils/insightSchedule.ts.
//
// firebase/functions is required on first use, not imported at the top (the ESLint rule enforces it), so it never
// costs startup time: the first call happens at least 3 s after Home is usable. The callable runs in the same
// Firebase app as Auth, so the signed-in user's ID token is attached automatically.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {getApp} from 'firebase/app';
import {onAuthStateChanged} from 'firebase/auth';
import type {HttpsCallable} from 'firebase/functions';
import {getFirebaseAuth} from '@/services/authInit';
import {createInsightCache} from '@/services/insightCache';
import {getSummaryRows} from '@/db/gamification';
import {computeSummary, type SummaryHabit} from '@/utils/summary';
import type {GamiCompletion} from '@/utils/gamification';
import {buildInsightInput, type InsightRequest} from '@/utils/insightInput';
import {createInsightRunner, type InsightView} from '@/utils/insightSchedule';
import {getLocalDateString} from '@/utils/dates';
import {mark} from '@/utils/startupTrace';

const REGION = 'africa-south1';// functions/src/config.js REGION
const CALL_TIMEOUT_MS = 25000;// the function itself stops at 30 s

const cache = createInsightCache(AsyncStorage);
const waits = new Map<string, number>();// busy / network waits, per uid, for this app run only
const inFlight = new Set<string>();

let callable: HttpsCallable<InsightRequest, unknown> | null = null;

function generateInsight(): HttpsCallable<InsightRequest, unknown> {
  if (!callable) {
    getFirebaseAuth();// makes sure the app and Auth exist, so the call carries the user's token
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose (see above)
    const sdk: typeof import('firebase/functions') = require('firebase/functions');
    callable = sdk.httpsCallable<InsightRequest, unknown>(sdk.getFunctions(getApp(), REGION), 'generateInsight', {timeout: CALL_TIMEOUT_MS});
  }
  return callable;
}

async function buildRequest(uid: string) {
  const {habits, completions} = (await getSummaryRows(uid)) as {habits: SummaryHabit[]; completions: GamiCompletion[]};
  return buildInsightInput(computeSummary(habits, completions, getLocalDateString()), habits);
}

// One runner per mounted card. `onChange` gets every new view; never called after dispose().
export function createAppInsightRunner(uid: string, onChange: (view: InsightView) => void) {
  return createInsightRunner({
    uid,
    readCache: cache.read,
    writeCache: cache.write,
    buildRequest: () => buildRequest(uid),
    call: async (request) => (await generateInsight()(request)).data,
    isAuthConfirmed: () => getFirebaseAuth().currentUser?.uid === uid,// a presumed uid never calls the function
    today: () => getLocalDateString(),
    now: () => Date.now(),
    waits,
    inFlight,
    onChange,
    mark,
    log: (message, err) => console.log(message, err),
  });
}

// Firebase confirming (or changing) the user: the card re-checks, e.g. after an offline launch
export function onAuthConfirmed(listener: () => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), () => listener());
}
