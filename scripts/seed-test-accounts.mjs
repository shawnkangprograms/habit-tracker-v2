// Seeds clearly labelled TEST accounts for the admin Stats demo, through the Admin SDK (run from your PC; never
// shipped in the app). Each account gets:
//   Auth:      hq-test-NN@habitquest.test (".test" is a reserved domain: no real mailbox), display name
//              "Test Account NN", a creation time spread over the last --days days, one shared password
//   Firestore: users/{uid} {age, firstName "Test", lastName "Account NN", createdAt, test: true}
//              2-5 habits and plausible ticks, in exactly the shapes the sync rules accept, so a phone signed in
//              as a test account pulls them normally
// Every stat is computed with and without these accounts (users/{uid}.test === true).
// Seeded accounts never "opened the app" (Auth has no last refresh for them) until someone signs in as one.
//
// Usage (PowerShell, from the repo root):
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\habit-tracker-v2-admin.json"   # service account key, never in the repo
//   node scripts/seed-test-accounts.mjs --project habit-tracker-v2-81e1c --count 20 --days 45
//   node scripts/seed-test-accounts.mjs --project habit-tracker-v2-81e1c --remove --yes
// Options: --count 1..50 (default 10), --days 7..120 (default 45), --password <min 8> (default: generated, printed
// once), --remove --yes (deletes ONLY accounts whose email ends @habitquest.test AND whose users doc has test: true).
// Re-running skips emails that already exist.

import {createRequire} from 'node:module';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {addDays, nairobiDateOf, nairobiDayStartMs, toDayNumber, weekdayOf} from '../functions/src/stats/aggregate.js';

// firebase-admin is a dependency of functions/ only (adding it to the app's package.json would change the fingerprint)
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp, applicationDefault} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');

const DOMAIN = '@habitquest.test';
const HOUR = 3600 * 1000;

// ---------- arguments ----------

function parseArgs(argv) {
  const args = {count: 10, days: 45, remove: false, yes: false, project: null, password: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--count') args.count = Number(value());
    else if (a === '--days') args.days = Number(value());
    else if (a === '--project') args.project = value();
    else if (a === '--password') args.password = value();
    else if (a === '--remove') args.remove = true;
    else if (a === '--yes') args.yes = true;
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 50) throw new Error('--count must be 1..50');
  if (!Number.isInteger(args.days) || args.days < 7 || args.days > 120) throw new Error('--days must be 7..120');
  if (args.password !== null && args.password.length < 8) throw new Error('--password must be at least 8 characters');
  return args;
}

// The project must be named explicitly and match .firebaserc, so the script can't write to the wrong project
function checkProject(project) {
  const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
  if (!project) throw new Error('--project is required');
  if (project !== rc.projects?.default) throw new Error(`--project ${project} is not this repo's project (${rc.projects?.default})`);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file first (see the header)');
  }
}

// ---------- plausible data ----------

// Seeded random, so a run is reproducible for the same account number
function rngFor(n) {
  let a = (0x9e3779b9 * n) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    bool: (p) => next() < p,
  };
}

// Valid names (1-30 chars) and icons from the app's fixed list
const HABITS = [
  {name: 'Morning run', icon: 'run'}, {name: 'Drink water', icon: 'water'}, {name: 'Read 20 pages', icon: 'book'},
  {name: 'Meditate', icon: 'meditate'}, {name: 'Sleep by 11', icon: 'sleep'}, {name: 'Cook at home', icon: 'food'},
  {name: 'Study session', icon: 'study'}, {name: 'Deep work block', icon: 'work'}, {name: 'Practice guitar', icon: 'music'},
  {name: 'Track spending', icon: 'money'}, {name: 'Call family', icon: 'heart'}, {name: 'Plan tomorrow', icon: 'star'},
];
const WEEKDAY_SETS = [['mon', 'wed', 'fri'], ['tue', 'thu'], ['sat', 'sun'], ['mon', 'tue', 'wed', 'thu', 'fri']];
const REMINDERS = [null, null, '06:30', '07:00', '12:30', '18:00', '21:00'];

function scheduledOn(habit, date) {
  return habit.frequencyType === 'daily' || habit.days.includes(weekdayOf(toDayNumber(date)));
}

function buildAccount(n, nowMs, historyDays) {
  const rng = rngFor(n);
  const label = String(n).padStart(2, '0');
  const today = nairobiDateOf(nowMs);
  const createdDate = addDays(today, -rng.int(0, historyDays));
  const createdMs = nairobiDayStartMs(createdDate) + rng.int(7, 21) * HOUR;
  const consistency = 0.35 + rng.next() * 0.55;// 35%..90% of scheduled days ticked

  const picked = [...HABITS].sort(() => rng.next() - 0.5).slice(0, rng.int(2, 5));
  const habits = picked.map((h, i) => {
    const weekdays = rng.bool(0.35);
    const habitCreatedMs = createdMs + i * 60 * 1000 + (rng.bool(0.25) ? rng.int(1, 10) * 24 * HOUR : 0);
    return {
      habitId: randomUUID(),
      habitName: h.name,
      icon: h.icon,
      frequencyType: weekdays ? 'weekdays' : 'daily',
      days: weekdays ? rng.pick(WEEKDAY_SETS) : [],
      reminderTime: rng.pick(REMINDERS),
      source: rng.bool(0.4) ? 'ai_suggested' : 'user',
      createdAt: Math.min(habitCreatedMs, nowMs),
      deleted: false,
    };
  });

  const completions = [];
  for (const h of habits) {
    const first = nairobiDateOf(h.createdAt);
    for (let date = first; date <= today; date = addDays(date, 1)) {
      if (!scheduledOn(h, date)) continue;
      const tickMs = nairobiDayStartMs(date) + rng.int(6, 22) * HOUR + rng.int(0, 59) * 60 * 1000;
      if (tickMs > nowMs || tickMs < h.createdAt) continue;
      if (rng.bool(consistency)) completions.push({habitId: h.habitId, date, completed: 1, updatedAt: tickMs});
      else if (rng.bool(0.05)) completions.push({habitId: h.habitId, date, completed: 0, updatedAt: tickMs});// ticked then unticked
    }
  }

  return {
    email: `hq-test-${label}${DOMAIN}`,
    displayName: `Test Account ${label}`,
    profile: {age: rng.int(18, 60), firstName: 'Test', lastName: `Account ${label}`},
    createdMs,
    habits,
    completions,
  };
}

// ---------- seed ----------

async function seed(args) {
  const auth = getAuth();
  const db = getFirestore();
  const password = args.password ?? `Hq-${randomBytes(6).toString('base64url')}`;
  const nowMs = Date.now();
  const writer = db.bulkWriter();
  let created = 0;

  for (let n = 1; n <= args.count; n++) {
    const account = buildAccount(n, nowMs, args.days);
    const exists = await auth.getUserByEmail(account.email).then(() => true, (err) => {
      if (err?.code === 'auth/user-not-found') return false;
      throw err;
    });
    if (exists) {
      console.log(`skip  ${account.email} (already exists)`);
      continue;
    }

    const uid = randomUUID().replace(/-/g, '').slice(0, 28);
    // importUsers is the only way to set a past creation time; the password is set right after
    const result = await auth.importUsers([{
      uid,
      email: account.email,
      displayName: account.displayName,
      metadata: {creationTime: new Date(account.createdMs).toUTCString()},
    }]);
    if (result.failureCount > 0) throw new Error(`Auth import failed for ${account.email}: ${result.errors[0]?.error?.message}`);
    await auth.updateUser(uid, {password});

    const userRef = db.collection('users').doc(uid);
    writer.set(userRef, {...account.profile, createdAt: Timestamp.fromMillis(account.createdMs), test: true});
    for (const h of account.habits) {
      writer.set(userRef.collection('habits').doc(h.habitId), {
        habitName: h.habitName, icon: h.icon, frequencyType: h.frequencyType, days: h.days, reminderTime: h.reminderTime,
        source: h.source, createdAt: h.createdAt, updatedAt: h.createdAt,
        serverUpdatedAt: Timestamp.fromMillis(h.createdAt), deleted: false,
      });
    }
    for (const c of account.completions) {
      writer.set(userRef.collection('completions').doc(`${c.habitId}_${c.date}`), {
        habitId: c.habitId, date: c.date, completed: c.completed, updatedAt: c.updatedAt,
        serverUpdatedAt: Timestamp.fromMillis(c.updatedAt),
      });
    }
    created += 1;
    console.log(`added ${account.email}  habits ${account.habits.length}  ticks ${account.completions.length}`);
  }

  await writer.close();
  console.log(`\nDone: ${created} test account(s) added.`);
  if (created > 0) console.log(`Password for every new test account: ${password}`);
  console.log('Then: refresh the stats (refreshStats with {days: 30}) so the past days include them.');
}

// ---------- remove ----------

async function remove(args) {
  if (!args.yes) throw new Error('--remove deletes accounts: add --yes to confirm');
  const auth = getAuth();
  const db = getFirestore();
  let pageToken;
  let removed = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email?.endsWith(DOMAIN)) continue;
      const userRef = db.collection('users').doc(u.uid);
      const snap = await userRef.get();
      if (snap.get('test') !== true) {
        console.log(`keep  ${u.email} (users doc is not marked test: true)`);
        continue;
      }
      await db.recursiveDelete(userRef);// the users doc, its habits and completions
      await db.collection('aiUsage').doc(u.uid).delete();
      await auth.deleteUser(u.uid);
      removed += 1;
      console.log(`removed ${u.email}`);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`\nDone: ${removed} test account(s) removed. Old stats/{day} docs keep their counts until recomputed.`);
}

// ---------- main ----------

try {
  const args = parseArgs(process.argv.slice(2));
  checkProject(args.project);
  initializeApp({credential: applicationDefault(), projectId: args.project});
  await (args.remove ? remove(args) : seed(args));
} catch (err) {
  console.error(`seed-test-accounts: ${err?.message ?? err}`);
  process.exitCode = 1;
}
