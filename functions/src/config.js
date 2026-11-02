// Every tunable of the generateInsight function, in one place. Pure constants: no imports, so the tests and
// scripts/gemini-smoke.mjs load it without Firebase.

// The ONLY model this project calls (free tier). No fallback model, no retry on another model.
export const MODEL_ID = 'gemini-3.5-flash-lite';
export const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

// Thinking tokens count toward maxOutputTokens. 'minimal' is the lowest level the docs list for 3.5 Flash-Lite.
// If scripts/gemini-smoke.mjs reports that the API rejects thinkingConfig, set this to null (the request then
// omits it) and raise MAX_OUTPUT_TOKENS as the script advises.
export const THINKING_LEVEL = 'minimal';
export const MAX_OUTPUT_TOKENS = 512;
export const TEMPERATURE = 0.6;

// Closest Cloud Functions (2nd gen) region to Nairobi, and the region of this project's Firestore database
export const REGION = 'africa-south1';
export const MAX_INSTANCES = 2;
export const FUNCTION_TIMEOUT_SECONDS = 30;
export const GEMINI_TIMEOUT_MS = 15000;// well inside the function timeout, so a slow model still gets a clean answer

// Limits, per Nairobi day (see nairobiDay in dailyLimit.js)
export const SUCCESSES_PER_USER_PER_DAY = 1;// the daily slot: used only by a generation that succeeded
export const ATTEMPTS_PER_USER_PER_DAY = 3;// every model call, failed or not
export const GLOBAL_ATTEMPTS_PER_DAY = 300;// every model call, all users (free tier: 500 requests a day)
export const GLOBAL_ATTEMPTS_PER_MINUTE = 12;// below the free tier's 15 requests a minute

// Input bounds (validateInput.js)
export const MAX_HABITS = 10;
export const MIN_TRACKED_DAYS = 3;
export const MAX_TRACKED_DAYS = 30;
export const MAX_STREAK = 3650;
export const MAX_INPUT_CHARS = 2048;// JSON length of the whole request; 10 habits need about 900

// Output bounds (validateOutput.js), in code points: the hard limits the server enforces
export const TEASER_MAX = 90;
export const DETAIL_MAX = 600;
// What the prompt asks for. Models count characters loosely, so the prompt aims about 20-25% below the hard
// limits (a 9-habit account got a teaser over 90 when the prompt asked for "at most 90").
export const TEASER_TARGET = 70;
export const DETAIL_TARGET = 450;

// Icon id -> the only habit description the model ever sees. The keys are the app's ICON_IDS
// (constants/habits.ts); a test keeps the two lists equal. No user text reaches the prompt.
export const ICON_LABELS = Object.freeze({
  book: 'Reading',
  water: 'Hydration',
  run: 'Exercise',
  meditate: 'Meditation',
  sleep: 'Sleep',
  food: 'Nutrition',
  study: 'Study',
  work: 'Work',
  music: 'Music',
  money: 'Finances',
  heart: 'Wellbeing',
  star: 'Personal goal',
});

export const WEEKDAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const WEEKDAY_NAMES = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});
