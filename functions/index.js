// generateInsight: the ONLY place HabitQuest calls Gemini. Callable (v2), signed-in users only.
// The app sends compact aggregates (validateInput.js); the function checks the user's and the global limits in
// a Firestore transaction (dailyLimit.js), calls the model once (gemini.js), validates the JSON it returns
// (validateOutput.js) and answers with one of:
//   {status: 'ok', day, teaser, detail} | {status: 'limit'} | {status: 'busy'} | {status: 'unavailable'}
// Errors thrown to the client: 'unauthenticated', 'invalid-argument', 'permission-denied' (disabled account).
//
// Logs: status, short reason codes, HTTP status, latency and token counts only. Never the uid, the request,
// the prompt, the model's text or the key.

import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/https';
import {onSchedule} from 'firebase-functions/scheduler';
import {defineSecret} from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';

import {FUNCTION_TIMEOUT_SECONDS, MAX_INSTANCES, MODEL_ID, REGION} from './src/config.js';
import {validateInput} from './src/validateInput.js';
import {decideAttempt, nairobiDay, recordSuccess} from './src/dailyLimit.js';
import {buildRequestBody} from './src/prompt.js';
import {callGemini} from './src/gemini.js';
import {validateOutput} from './src/validateOutput.js';
import {addDays, computeDayStats, nairobiDateOf, refreshAllowed, refreshDays} from './src/stats/aggregate.js';
import {loadStatsInput} from './src/stats/load.js';
import {
  STATS_CALLABLE_REGION, STATS_MEMORY, STATS_SCHEDULE, STATS_SCHEDULE_REGION, STATS_TIME_ZONE, STATS_TIMEOUT_SECONDS,
} from './src/stats/config.js';

initializeApp();

// Set with `firebase functions:secrets:set GEMINI_API_KEY`; bound to this function only
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const UNAVAILABLE = {status: 'unavailable'};

export const generateInsight = onCall(
  {
    region: REGION,
    secrets: [GEMINI_API_KEY],
    maxInstances: MAX_INSTANCES,
    timeoutSeconds: FUNCTION_TIMEOUT_SECONDS,
    memory: '256MiB',
  },
  async (request) => {
    const startedAt = Date.now();
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to get insights.');

    const input = validateInput(request.data);
    if (!input.ok) {
      logger.warn('generateInsight rejected input', {reason: input.reason});
      throw new HttpsError('invalid-argument', 'Invalid insight request.');
    }

    const db = getFirestore();
    const usageRef = db.collection('aiUsage').doc(uid);

    // Check and reserve one attempt atomically. 'limit' and 'busy' write nothing.
    let decision;
    try {
      decision = await db.runTransaction(async (tx) => {
        const now = Date.now();
        const dailyRef = db.collection('aiUsageDaily').doc(nairobiDay(now));
        const [userSnap, usageSnap, dailySnap] = await tx.getAll(db.collection('users').doc(uid), usageRef, dailyRef);
        const result = decideAttempt({
          disabled: userSnap.get('disabled') === true,
          usage: usageSnap.data() ?? null,
          daily: dailySnap.data() ?? null,
          now,
        });
        if (result.action === 'allow') {
          tx.set(usageRef, result.usage);
          tx.set(dailyRef, result.daily);
        }
        return result;
      });
    } catch (err) {
      logger.error('generateInsight limit transaction failed', {code: err?.code ?? null});
      return UNAVAILABLE;
    }

    if (decision.action === 'disabled') throw new HttpsError('permission-denied', 'This account is disabled.');
    if (decision.action !== 'allow') {
      logger.info('generateInsight refused', {status: decision.action});
      return {status: decision.action};
    }

    const response = await callGemini({apiKey: GEMINI_API_KEY.value(), body: buildRequestBody(input.value)});
    const ms = Date.now() - startedAt;
    if (!response.ok) {
      logger.warn('generateInsight model call failed', {reason: response.reason, httpStatus: response.status, ms});
      return UNAVAILABLE;
    }
    const usageMeta = response.json?.usageMetadata ?? {};
    const tokens = {
      thoughtsTokens: usageMeta.thoughtsTokenCount ?? null,
      outputTokens: usageMeta.candidatesTokenCount ?? null,
    };
    const output = validateOutput(response.json);
    if (!output.ok) {
      // lengths are code-point counts only; the model's text is never logged
      logger.warn('generateInsight invalid model output', {
        reason: output.reason,
        teaserLength: output.lengths.teaser,
        detailLength: output.lengths.detail,
        ms,
        ...tokens,
      });
      return UNAVAILABLE;
    }

    // Use the daily slot. If this write fails the insight is still returned; the attempt cap still applies.
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        tx.set(usageRef, recordSuccess(snap.data() ?? null, decision.day, Date.now()));
      });
    } catch (err) {
      logger.error('generateInsight success write failed', {code: err?.code ?? null});
    }

    logger.info('generateInsight ok', {model: MODEL_ID, ms, ...tokens});
    return {status: 'ok', day: decision.day, teaser: output.value.teaser, detail: output.value.detail};
  },
);

// ---------- Admin stats (functions/src/stats): counts only, written to stats/{YYYY-MM-DD} ----------
// The rules let admins read stats/{day} and nobody write it; only these functions (Admin SDK) write.
// Logs: day counts, doc counts and latency only. Never a uid or any user data.

// Loads once for all `days`, then writes one merged doc per day. Merge, because keys that can't be measured
// (e.g. "opened the app" for an old day) are left out and must keep any value an earlier run wrote.
async function writeStats(days, trigger) {
  const startedAt = Date.now();
  const db = getFirestore();
  const input = await loadStatsInput({db, auth: getAuth()}, days);
  const now = Date.now();
  const batch = db.batch();
  for (const day of days) {
    batch.set(db.collection('stats').doc(day), {
      ...computeDayStats(input, day, now),
      computedAt: FieldValue.serverTimestamp(),
      trigger,
    }, {merge: true});
  }
  await batch.commit();
  logger.info('stats written', {
    trigger,
    days: days.length,
    accounts: input.authUsers.length,
    habitDocs: input.habits.length,
    completionDocs: input.completions.length,
    ms: Date.now() - startedAt,
  });
}

// Every night at 00:15 Nairobi time: yesterday's (now closed) day
export const computeDailyStats = onSchedule(
  {
    schedule: STATS_SCHEDULE,
    timeZone: STATS_TIME_ZONE,
    region: STATS_SCHEDULE_REGION,
    memory: STATS_MEMORY,
    timeoutSeconds: STATS_TIMEOUT_SECONDS,
    maxInstances: 1,
    retryCount: 1,
  },
  async () => {
    await writeStats([addDays(nairobiDateOf(Date.now()), -1)], 'schedule');
  },
);

// Admins only (admins/{uid} exists), at most once a minute across all admins.
// data: {days?: 1..30} recomputes today and the days before it (default 1: today only).
// Answers {status: 'ok', days} or throws 'unauthenticated', 'permission-denied', 'resource-exhausted', 'internal'.
export const refreshStats = onCall(
  {
    region: STATS_CALLABLE_REGION,
    memory: STATS_MEMORY,
    timeoutSeconds: 120,
    maxInstances: 1,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const db = getFirestore();
    const admin = await db.collection('admins').doc(uid).get();
    if (!admin.exists) throw new HttpsError('permission-denied', 'Admins only.');

    const metaRef = db.collection('statsMeta').doc('refresh');
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      const now = Date.now();
      if (!refreshAllowed(snap.get('lastAt') ?? null, now)) return false;
      tx.set(metaRef, {lastAt: now});
      return true;
    });
    if (!allowed) throw new HttpsError('resource-exhausted', 'Stats were refreshed less than a minute ago.');

    const days = refreshDays(request.data?.days, Date.now());
    try {
      await writeStats(days, 'refresh');
    } catch (err) {
      logger.error('refreshStats failed', {code: err?.code ?? null});
      throw new HttpsError('internal', 'Stats could not be refreshed.');
    }
    return {status: 'ok', days: days.length};
  },
);
