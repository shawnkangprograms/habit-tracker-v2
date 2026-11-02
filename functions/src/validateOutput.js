// Turns a generateContent response into {teaser, detail}, or a clean failure. Pure: runs without the network.
// The schema in the request is a hint, not a guarantee (the API does not enforce string lengths), so every
// bound is checked here. Failure reasons are short codes, safe to log (never model text).

import {DETAIL_MAX, TEASER_MAX} from './config.js';

// Control characters: none in the teaser; the detail may keep line breaks
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

function codePoints(s) {
  return [...s].length;
}

/**
 * Every failure carries `lengths`: the cleaned teaser and detail lengths in code points, null when that field
 * is missing or not a string, or the text was not a JSON object. Numbers only, so they are safe to log.
 * @typedef {{teaser: number | null, detail: number | null}} OutputLengths
 * @typedef {{ok: true, value: {teaser: string, detail: string}} |
 *           {ok: false, reason: string, lengths: OutputLengths}} OutputResult
 */

const NO_LENGTHS = Object.freeze({teaser: null, detail: null});

/** @returns {OutputResult} */
function fail(reason, lengths = NO_LENGTHS) {
  return {ok: false, reason, lengths: {...lengths}};
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// What the card would show: NFC, CRLF to LF (detail only), trimmed. Null for a non-string.
function cleanTeaser(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : null;
}

function cleanDetail(value) {
  return typeof value === 'string' ? value.normalize('NFC').replace(/\r\n?/g, '\n').trim() : null;
}

/** @returns {OutputResult} */
export function validateOutput(response) {
  if (!isPlainObject(response)) return fail('no_response');
  if (response.promptFeedback?.blockReason) return fail('blocked');
  const candidates = response.candidates;
  if (!Array.isArray(candidates) || candidates.length !== 1) return fail('candidates');
  const candidate = candidates[0];
  if (!isPlainObject(candidate)) return fail('candidates');
  if (candidate.finishReason !== 'STOP') {
    return fail(`finish_${typeof candidate.finishReason === 'string' ? candidate.finishReason : 'missing'}`);
  }
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) return fail('no_parts');
  // thought parts (if the API ever returns them) are not the answer
  const text = parts
    .filter((p) => isPlainObject(p) && p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (text.trim() === '') return fail('empty');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not_json');
  }
  if (!isPlainObject(parsed)) return fail('not_object');

  const teaser = cleanTeaser(parsed.teaser);
  const detail = cleanDetail(parsed.detail);
  const lengths = {teaser: teaser === null ? null : codePoints(teaser), detail: detail === null ? null : codePoints(detail)};
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !Object.hasOwn(parsed, 'teaser') || !Object.hasOwn(parsed, 'detail')) return fail('keys', lengths);
  if (teaser === null || detail === null) return fail('types', lengths);

  if (teaser === '' || lengths.teaser > TEASER_MAX) return fail('teaser_length', lengths);
  if (detail === '' || lengths.detail > DETAIL_MAX) return fail('detail_length', lengths);
  if (CONTROL.test(teaser)) return fail('teaser_chars', lengths);
  if (CONTROL_EXCEPT_NEWLINE.test(detail)) return fail('detail_chars', lengths);
  return {ok: true, value: {teaser, detail}};
}
