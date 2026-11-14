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

// Icon id -> the only habit description the model ever sees. The keys cover every id of the app's icon set
// (constants/habitIconSet.ts), so the function accepts any icon a phone can send; a test keeps that true. No user text
// reaches the prompt. The twelve icons of 1.0 keep their labels; every C3 icon maps to its GROUP's coarse label only
// (Health, Mind, Discipline, Career, Learning, Relations, or Personal for General), never to a specific habit, so a
// private habit (prayer, therapy, alcohol) is never named to the model (C3, D8; tests/insight-input-validation.test.ts).
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
  // Health: the group's coarse label only
  walk: 'Health', running: 'Health', bike: 'Health', swim: 'Health', yoga: 'Health', weights: 'Health',
  hike: 'Health', dance: 'Health', football: 'Health', basketball: 'Health', tennis: 'Health', stairs: 'Health',
  vitamins: 'Health', medicine: 'Health', teeth: 'Health', shower: 'Health', skincare: 'Health', fruit: 'Health',
  vegetables: 'Health', cook: 'Health', breakfast: 'Health', no_sugar: 'Health', no_alcohol: 'Health', no_smoking: 'Health',
  less_coffee: 'Health', weigh_in: 'Health', posture: 'Health', eye_rest: 'Health', nap: 'Health', sunlight: 'Health',
  // Mind: the group's coarse label only
  journal: 'Mind', gratitude: 'Mind', breathe: 'Mind', relax: 'Mind', mood: 'Mind', therapy: 'Mind',
  pray: 'Mind', nature: 'Mind', flowers: 'Mind', no_phone: 'Mind', no_tv: 'Mind', art: 'Mind',
  draw: 'Mind', guitar: 'Mind', piano: 'Mind', sing: 'Mind', puzzle: 'Mind', self_care: 'Mind',
  // Discipline: the group's coarse label only
  checklist: 'Discipline', plan_day: 'Discipline', timer: 'Discipline', focus: 'Discipline', wake_early: 'Discipline', tidy: 'Discipline',
  laundry: 'Discipline', dishes: 'Discipline', clean: 'Discipline', declutter: 'Discipline', no_snooze: 'Discipline', routine: 'Discipline',
  goal: 'Discipline', done: 'Discipline', inbox_zero: 'Discipline', cold_shower: 'Discipline', fasting: 'Discipline', screen_limit: 'Discipline',
  shopping_list: 'Discipline', meal_prep: 'Discipline', essentials: 'Discipline',
  // Career: the group's coarse label only
  laptop: 'Career', code: 'Career', present: 'Career', growth: 'Career', savings: 'Career', invest: 'Career',
  network: 'Career', cv: 'Career', calendar: 'Career', write: 'Career', idea: 'Career', side_project: 'Career',
  business: 'Career', tools: 'Career', budget: 'Career', receipt: 'Career',
  // Learning: the group's coarse label only
  language: 'Learning', flashcards: 'Learning', course: 'Learning', library: 'Learning', notes: 'Learning', math: 'Learning',
  science: 'Learning', history: 'Learning', geography: 'Learning', video_lesson: 'Learning', audiobook: 'Learning', news: 'Learning',
  chess: 'Learning', quiz: 'Learning', brain: 'Learning', research: 'Learning', vocabulary: 'Learning', teach: 'Learning',
  // Relations: the group's coarse label only
  family: 'Relations', call_family: 'Relations', message: 'Relations', friends: 'Relations', partner: 'Relations', kids: 'Relations',
  pet: 'Relations', dog: 'Relations', gift: 'Relations', volunteer: 'Relations', community: 'Relations', faith: 'Relations',
  mosque: 'Relations', letter: 'Relations', coffee_chat: 'Relations', birthday: 'Relations', compliment: 'Relations', listen: 'Relations',
  video_call: 'Relations', share_meal: 'Relations',
  // General: the group's coarse label only
  trophy: 'Personal', energy: 'Personal', diamond: 'Personal', map: 'Personal', travel: 'Personal', drive: 'Personal',
  home: 'Personal', plant: 'Personal', photo: 'Personal', bookmark: 'Personal', reminder: 'Personal',
});

export const WEEKDAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const WEEKDAY_NAMES = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});
