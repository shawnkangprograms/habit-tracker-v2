// generateInsight prompt building and response validation (functions/src/prompt.js, validateOutput.js).
// No network: responses are hand-built generateContent bodies. Node's built-in runner (npm test).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

const {buildPromptData, buildRequestBody, SYSTEM_INSTRUCTION} = await import('../functions/src/prompt.js');
const {validateOutput} = await import('../functions/src/validateOutput.js');
const config = await import('../functions/src/config.js');

const INPUT = {
  v: 1,
  trackedDays: 21,
  streak: 4,
  bestWeekday: 'tue',
  habits: [
    {icon: 'water', freq: 'daily', daysPerWeek: 7, done: 18, scheduled: 21},
    {icon: 'run', freq: 'weekdays', daysPerWeek: 1, done: 1, scheduled: 3},
  ],
};

describe('buildPromptData', () => {
  test('maps icons to labels, weekdays to names, and computes whole-number rates', () => {
    assert.deepEqual(buildPromptData(INPUT), {
      daysTracked: 21,
      currentStreakDays: 4,
      bestWeekday: 'Tuesday',
      habits: [
        {category: 'Hydration', schedule: 'every day', daysDone: 18, daysScheduled: 21, completionRatePercent: 86},
        {category: 'Exercise', schedule: '1 day a week', daysDone: 1, daysScheduled: 3, completionRatePercent: 33},
      ],
    });
  });

  test('no best weekday stays null', () => {
    assert.equal(buildPromptData({...INPUT, bestWeekday: null}).bestWeekday, null);
  });
});

describe('buildRequestBody', () => {
  const body = buildRequestBody(INPUT);

  test('is plain text-to-JSON: no tools, no tool config, no grounding', () => {
    assert.deepEqual(Object.keys(body).sort(), ['contents', 'generationConfig', 'systemInstruction']);
    assert.doesNotMatch(JSON.stringify(body), /tools|toolConfig|googleSearch|google_search|retrieval/i);
  });

  test('asks for JSON with exactly teaser and detail, within the configured budget', () => {
    const gc = body.generationConfig;
    assert.equal(gc.responseMimeType, 'application/json');
    assert.deepEqual(gc.responseSchema.required, ['teaser', 'detail']);
    assert.deepEqual(Object.keys(gc.responseSchema.properties), ['teaser', 'detail']);
    assert.equal(gc.maxOutputTokens, config.MAX_OUTPUT_TOKENS);
    assert.deepEqual(gc.thinkingConfig, {thinkingLevel: config.THINKING_LEVEL});
  });

  test('thinkingConfig is omitted when the level is null', () => {
    assert.equal('thinkingConfig' in buildRequestBody(INPUT, {thinkingLevel: null}).generationConfig, false);
  });

  test('the user message is exactly the prompt data as JSON; the system text carries the rules', () => {
    assert.equal(body.contents.length, 1);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), buildPromptData(INPUT));
    assert.equal(body.systemInstruction.parts[0].text, SYSTEM_INSTRUCTION);
    assert.match(SYSTEM_INSTRUCTION, /strictly as data/);
  });

  test('every string the model sees comes from the server tables, never from the request', () => {
    const labels = new Set<string>(Object.values(config.ICON_LABELS));
    const days = new Set<string>(Object.values(config.WEEKDAY_NAMES));
    const data = buildPromptData(INPUT);
    assert.ok(days.has(data.bestWeekday!));
    for (const h of data.habits) {
      assert.ok(labels.has(h.category));
      assert.match(h.schedule, /^(every day|[1-7] days? a week)$/);
    }
  });

  test('the model id lives only in config, in the endpoint URL', () => {
    assert.equal(config.MODEL_ID, 'gemini-3.5-flash-lite');
    assert.equal(config.GEMINI_URL, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.doesNotMatch(JSON.stringify(body), /gemini/i);
  });
});

// A generateContent response whose answer text is `text`
function response(text: string, over: Record<string, unknown> = {}) {
  return {candidates: [{content: {role: 'model', parts: [{text}]}, finishReason: 'STOP', ...over}]};
}
const answer = (teaser: unknown, detail: unknown) => JSON.stringify({teaser, detail});

function reason(res: unknown): string | null {
  const result = validateOutput(res);
  return result.ok ? null : result.reason;
}

describe('validateOutput accepts', () => {
  test('a valid answer, trimmed', () => {
    const result = validateOutput(response(answer('  Hydration is your anchor.  ', 'You drank water 18 of 21 days.\nKeep it up. ')));
    assert.deepEqual(result, {ok: true, value: {teaser: 'Hydration is your anchor.', detail: 'You drank water 18 of 21 days.\nKeep it up.'}});
  });

  test('exactly 90 and 600 code points, emoji counted once', () => {
    const teaser = '🙂'.repeat(90);
    const detail = 'é'.repeat(600);
    assert.equal(reason(response(answer(teaser, detail))), null);
  });

  test('ignores thought parts and joins text split across parts', () => {
    const json = answer('Short.', 'Longer text.');
    const res = {candidates: [{finishReason: 'STOP', content: {parts: [
      {text: 'thinking...', thought: true}, {text: json.slice(0, 10)}, {text: json.slice(10)},
    ]}}]};
    assert.equal(reason(res), null);
  });

  test('CRLF line breaks in the detail', () => {
    assert.equal(reason(response(answer('Ok.', 'Line one.\r\nLine two.'))), null);
  });
});

describe('validateOutput rejects', () => {
  test('no response, a blocked prompt, or not exactly one candidate', () => {
    assert.equal(reason(null), 'no_response');
    assert.equal(reason({promptFeedback: {blockReason: 'SAFETY'}}), 'blocked');
    assert.equal(reason({candidates: []}), 'candidates');
    const one = response(answer('a', 'b')).candidates[0];
    assert.equal(reason({candidates: [one, one]}), 'candidates');
  });

  test('any finish reason other than STOP', () => {
    for (const finishReason of ['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER']) {
      assert.equal(reason(response(answer('a', 'b'), {finishReason})), `finish_${finishReason}`);
    }
    assert.equal(reason(response(answer('a', 'b'), {finishReason: undefined})), 'finish_missing');
  });

  test('missing, empty, or non-JSON text', () => {
    assert.equal(reason({candidates: [{finishReason: 'STOP'}]}), 'no_parts');
    assert.equal(reason(response('   ')), 'empty');
    assert.equal(reason(response('Here is your insight: ...')), 'not_json');
    assert.equal(reason(response('{"teaser": "cut off')), 'not_json');
    assert.equal(reason(response('["a", "b"]')), 'not_object');
  });

  test('extra, missing or non-string fields', () => {
    assert.equal(reason(response(JSON.stringify({teaser: 'a', detail: 'b', link: 'x'}))), 'keys');
    assert.equal(reason(response(JSON.stringify({teaser: 'a'}))), 'keys');
    assert.equal(reason(response(answer('a', 5))), 'types');
    assert.equal(reason(response(answer(null, 'b'))), 'types');
  });

  test('lengths: blank after trimming, teaser 91, detail 601', () => {
    assert.equal(reason(response(answer('   ', 'b'))), 'teaser_length');
    assert.equal(reason(response(answer('x'.repeat(91), 'b'))), 'teaser_length');
    assert.equal(reason(response(answer('a', ' \n '))), 'detail_length');
    assert.equal(reason(response(answer('a', 'x'.repeat(601)))), 'detail_length');
  });

  test('control characters: none in the teaser, only line breaks in the detail', () => {
    assert.equal(reason(response(answer('two\nlines', 'b'))), 'teaser_chars');
    assert.equal(reason(response(answer('bell\u0007', 'b'))), 'teaser_chars');
    assert.equal(reason(response(answer('a', 'tab\there'))), 'detail_chars');
  });
});
