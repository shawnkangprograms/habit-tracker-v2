// One generateContent call. No retry, no fallback model: any failure is returned as a short reason and the
// caller answers 'unavailable'. `fetchImpl` is injectable so this runs in tests without the network.
//
// The key travels only in the x-goog-api-key header, never in the URL, so it cannot appear in a logged URL or
// error. Nothing here logs. `message` is Gemini's own error text (it does not echo the key); the function does
// not log it, the smoke script prints it to diagnose a wrong model id.

import {GEMINI_TIMEOUT_MS, GEMINI_URL} from './config.js';

function httpReason(status) {
  if (status === 429) return 'http_429';
  if (status >= 500) return 'http_5xx';
  return 'http_4xx';
}

/**
 * @returns {Promise<{ok: true, status: number, json: unknown} |
 *                   {ok: false, reason: string, status: number | null, message: string | null}>}
 */
export async function callGemini({apiKey, body, fetchImpl = fetch, timeoutMs = GEMINI_TIMEOUT_MS}) {
  let res;
  try {
    res = await fetchImpl(GEMINI_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {ok: false, reason: timedOut ? 'timeout' : 'network', status: null, message: null};
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // an empty or non-JSON body: handled below
  }
  if (!res.ok) {
    const message = typeof json?.error?.message === 'string' ? json.error.message : null;
    return {ok: false, reason: httpReason(res.status), status: res.status, message};
  }
  if (json === null) return {ok: false, reason: 'bad_json', status: res.status, message: null};
  return {ok: true, status: res.status, json};
}
