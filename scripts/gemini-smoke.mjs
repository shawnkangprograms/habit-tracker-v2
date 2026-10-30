// One-off check, run from your own terminal before deploying: sends ONE tiny insight request to MODEL_ID with
// exactly the body the function builds (functions/src), so a wrong model id or a broken request shape fails
// here and not on testers' phones. Also checks that thinking tokens leave room under MAX_OUTPUT_TOKENS.
//
// The key is read only from the GEMINI_API_KEY environment variable. It is never printed, logged or written
// to a file; any text printed from the API is scrubbed of it as well. In PowerShell:
//   $s = Read-Host -AsSecureString "Gemini key"     # typed input is not saved to PSReadLine history
//   $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $s).Password
//   node scripts/gemini-smoke.mjs
//   Remove-Item Env:GEMINI_API_KEY
//
// Exit code 0 = ready to deploy; 1 = fix something first (the output says what); 2 = no key set.

import {MAX_OUTPUT_TOKENS, MODEL_ID, THINKING_LEVEL} from '../functions/src/config.js';
import {validateInput} from '../functions/src/validateInput.js';
import {buildRequestBody} from '../functions/src/prompt.js';
import {callGemini} from '../functions/src/gemini.js';
import {validateOutput} from '../functions/src/validateOutput.js';

// Share of MAX_OUTPUT_TOKENS that thinking + answer may use before the budget counts as too tight
const SAFE_SHARE = 0.6;

const apiKey = process.env.GEMINI_API_KEY ?? '';
if (apiKey.trim() === '') {
  console.log('GEMINI_API_KEY is not set in this terminal. See the comment at the top of this script.');
  process.exit(2);
}

function scrub(text) {
  return typeof text === 'string' ? text.split(apiKey).join('[key]') : text;
}

const FIXTURE = {
  v: 1,
  trackedDays: 21,
  streak: 4,
  bestWeekday: 'tue',
  habits: [
    {icon: 'water', freq: 'daily', daysPerWeek: 7, done: 18, scheduled: 21},
    {icon: 'run', freq: 'weekdays', daysPerWeek: 3, done: 4, scheduled: 9},
    {icon: 'book', freq: 'daily', daysPerWeek: 7, done: 11, scheduled: 21},
  ],
};

async function send(thinkingLevel) {
  const startedAt = Date.now();
  const res = await callGemini({apiKey, body: buildRequestBody(input.value, {thinkingLevel})});
  return {res, ms: Date.now() - startedAt};
}

function reportFailure(res) {
  console.log(`  reason: ${res.reason}, HTTP ${res.status ?? '-'}`);
  if (res.message) console.log(`  API message: ${scrub(res.message)}`);
  if (res.status === 404) console.log(`  -> "${MODEL_ID}" is not available to this key. Check MODEL_ID in functions/src/config.js.`);
  if (res.status === 400 || res.status === 403) console.log('  -> Check the key (AI Studio project, API restrictions) and the request shape.');
  if (res.reason === 'http_429') console.log('  -> Rate limited: wait a minute and run once more (the function itself never retries).');
}

const input = validateInput(FIXTURE);
if (!input.ok) {
  console.log(`Fixture failed validateInput (${input.reason}): fix the script.`);
  process.exit(1);
}

console.log(`Model: ${MODEL_ID}`);
console.log(`Request: thinkingLevel=${THINKING_LEVEL ?? 'none'}, maxOutputTokens=${MAX_OUTPUT_TOKENS}, no tools`);

let {res, ms} = await send(THINKING_LEVEL);
let thinkingAccepted = THINKING_LEVEL ? true : null;

// Thinking control rejected? Try once without it, to tell a bad thinkingConfig from a bad model id or key.
if (!res.ok && res.status === 400 && THINKING_LEVEL && /think/i.test(res.message ?? '')) {
  console.log('\nThe API rejected thinkingConfig:');
  reportFailure(res);
  console.log('\nRetrying ONCE without thinkingConfig...');
  thinkingAccepted = false;
  ({res, ms} = await send(null));
}

if (!res.ok) {
  console.log('\nFAIL: the model call failed.');
  reportFailure(res);
  process.exit(1);
}

const json = res.json;
const usage = json?.usageMetadata ?? {};
const thoughts = usage.thoughtsTokenCount ?? 0;
const answer = usage.candidatesTokenCount ?? 0;
const used = thoughts + answer;
const finishReason = json?.candidates?.[0]?.finishReason ?? 'missing';
const output = validateOutput(json);

console.log(`\nHTTP ${res.status} in ${ms} ms, finishReason ${finishReason}`);
console.log(`Tokens: prompt ${usage.promptTokenCount ?? '?'}, thinking ${thoughts}, answer ${answer}, `
  + `thinking + answer = ${used} of maxOutputTokens ${MAX_OUTPUT_TOKENS} (${Math.round((used / MAX_OUTPUT_TOKENS) * 100)}%)`);

let ok = true;
if (thinkingAccepted === false) {
  ok = false;
  console.log('\nFAIL: thinkingConfig is not accepted for this model. In functions/src/config.js set THINKING_LEVEL = null');
}
const tight = finishReason === 'MAX_TOKENS' || used > MAX_OUTPUT_TOKENS * SAFE_SHARE;
if (tight) {
  ok = false;
  const suggested = Math.ceil((used * 2) / 128) * 128;
  console.log(`\nFAIL: thinking + answer use too much of the budget. Raise MAX_OUTPUT_TOKENS to at least ${Math.max(suggested, 1024)}.`);
}
if (!output.ok) {
  ok = false;
  console.log(`\nFAIL: the response did not pass validateOutput (${output.reason}).`);
} else {
  console.log(`\nTeaser (${[...output.value.teaser].length} chars): ${scrub(output.value.teaser)}`);
  console.log(`Detail (${[...output.value.detail].length} chars): ${scrub(output.value.detail)}`);
}

console.log(ok ? '\nPASS: ready to deploy.' : '\nNot ready: fix the FAIL lines above, then run this once more.');
process.exit(ok ? 0 : 1);
