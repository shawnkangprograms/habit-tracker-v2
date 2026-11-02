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
import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError, onCall} from 'firebase-functions/https';
import {defineSecret} from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';

import {FUNCTION_TIMEOUT_SECONDS, MAX_INSTANCES, MODEL_ID, REGION} from './src/config.js';
import {validateInput} from './src/validateInput.js';
import {decideAttempt, nairobiDay, recordSuccess} from './src/dailyLimit.js';
import {buildRequestBody} from './src/prompt.js';
import {callGemini} from './src/gemini.js';
import {validateOutput} from './src/validateOutput.js';

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
