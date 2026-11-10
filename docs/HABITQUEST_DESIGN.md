# HabitQuest (habit-tracker-v2) — Locked Design Decisions

Single source of truth. If code and this file disagree, flag it; do not silently pick one.
The detailed CRUD + validation rule tables are in the published doc:
https://claude.ai/artifact/AupM7DJ3Fcw5b746p54JJc

## Stack and environment
- Expo SDK 57 (Expo Go compatible), Expo Router, React Native, TypeScript/JS mix
- semver ^7.8.5 is a direct dependency only as a workaround for a Metro resolution failure on react-native-reanimated's nested semver (SDK 57); remove when the cause is understood.
- Local SQLite (expo-sqlite) is the source of truth; Firebase (Auth + Firestore) for backup/sync
- Dev on Windows/PowerShell/VS Code. Test devices: iPhone 13 Pro (iOS 26), Itel A60s (Android 12 Go, 32-bit)
- Folder structure: type-based (/components, /db, /sync, /services); screens live in /app per Expo Router

## Architecture
- Local-first: all reads/writes hit SQLite; sync is background and must fail silently (no error shown to user). One exception (S-1, 2026-11-09): the clock line in Settings, below
- Tables: habits, habitDays (normalised weekday rows, no JSON arrays), completions (composite primary key habitId + date). Completions use an explicit row per habit per day with completed true/false (not insert-on-complete)
- Sync tracking: a `synced` flag on each row, set false on local write, true after successful push; only unsynced rows are pushed
- Sync triggers: app foreground + every 5 minutes while open. No network-reconnect listener in v1 (avoids netinfo dependency)
- Conflict rule (revised after code audit; replaces the earlier sticky-true rule): last-write-wins on a per-row `updatedAt` (ms timestamp). Only user actions (add, edit, delete, toggle) set `updatedAt`, to `max(Date.now(), the row's updatedAt + 1)` since the 2026-11-09 decision S-1 (see "Decisions from the test-strategy audit"). System-generated rows (ensureTodayRows / backfill) get `updatedAt = 0` so they can never overwrite a real user action from another device or a previous install. Reason: sticky-true made unchecking impossible once a true had synced
- AI: server-side only via Cloud Function calling Gemini API (free tier Flash/Flash-Lite). Never call the AI API from the client
- Insight UI: expandable card on Home; insight text cached locally for offline viewing; offline with no insight shows a "check back once you're online" message
- Auth: Firebase Auth email/password; sessions persist locally so internet is needed only for first sign-up/sign-in

## Operations
- Habits: Add, Update (full edit via the add form, pre-filled), Delete = SOFT delete (`deleted` flag, synced like any field). All reads filter `deleted = false`. Changing frequency never alters past completion rows
- Completions: never user-added. On Home mount, lazily backfill every missing day per active habit as completed:false up to today, and ensure today's row exists. Only today's row is user-toggleable. No delete
- Onboarding: add once at signup, retakeable from Settings (retake ADDS suggested habits, never replaces). No delete
- Auth: signup; edit email/password in Settings (requires reauthenticateWithCredential first, handle auth/requires-recent-login). Account deletion OUT of scope

## Validation (summary; full tables in the published doc)
- habit.name: trim, then 1-30 chars. icon: string in fixed allowed list. frequency: {type:'daily'} or {type:'weekdays', days[]} with real array, valid weekday strings, no duplicates, at least 1. reminder_time: nullable; if set must match ^([01]\d|2[0-3]):[0-5]\d$
- completed: strict typeof boolean
- onboarding goal/lifestyle/biggest_challenge: fixed multiple-choice enums
- email: trim, lowercase, ^[^@\s]+@[^@\s]+\.[^@\s]+$, max 254; Firebase is authoritative (map auth/invalid-email, auth/email-already-in-use to friendly messages)
- password: raw (no trim), min 8; map auth/weak-password. confirm_password must match
- age: integer 18-99 (18 minimum avoids Kenya Data Protection Act 2019 s.33 parental-consent duty)
- UX: inline errors as the user types/leaves a field, Save disabled until valid, errors clear when fixed

## Scope (committed)
Full Figma prototype scope: Sign In/Up, 10-question onboarding, building-profile screen, 6-axis radar "Habit Profile", recommended routine, Home with XP progress ring, Habit Detail, Summary (day/week/month/year), Profile (level, streaks, lifetime stats and medals), Settings (your name, reminders and celebrations, habit packs, the plan retake and sign-out), Level-Up overlay, bottom tabs Home/Summary/Profile/Settings (corrected 2026-11-10: the app has had a separate Profile tab; this line said "Settings (profile merged in)" and three tabs). The Figma file has NO Add/Edit Habit screen; design it in the same visual language. XP is derived from completions and the reflections kept on the phone (no table, no stored total; docs/PACKS_REPORTS_SPEC.md sections 12 and 16). Splash: Expo native splash only
- Out of scope: social/multi-user, monetization, full encryption, account deletion

## Build order and testing
1. Data model + rough UI (with validation) -> 2. sync with last-write-wins -> 3. AI Cloud Function -> 4. polish pass -> charts only if time remains
- Tests: 3-5 unit tests for the sync conflict-merge function only; everything else manual

## Decisions made after the first code audit
- Naming: keep the existing camelCase in code and SQLite (habitId, habitName, reminderTime). The snake_case names in the validation doc are descriptive only
- Conflict rule: last-write-wins on updatedAt (see Architecture)
- Age gate: a required age field on the signup form, validated 18-99 BEFORE calling createUserWithEmailAndPassword, so no account is ever created for an under-18 user. Store age as a number. If onboarding includes an age-range question, it must not offer an under-18 option
- firstName/lastName (revised 2026-11-04, replaces "remove from signup and from the users document"): asked at sign-up (required; trimmed, 1-40 characters, letters in any script, spaces, hyphens and apostrophes) and editable in Settings > Your name. Stored on the user's own Firestore users document (firstName, lastName; optional in the rules so older builds still sign up), as Auth displayName "First Last", and as a copy on the device (AsyncStorage profile:name:v1, read with the sign-in marker) so Home's greeting has it on the first render offline. Reason: used only for the greeting; never sent to Gemini or any analytics, and never shown in the admin screens. The privacy policy and the Play Data safety form must list "Name"
- Dates: one shared helper that returns the LOCAL date as YYYY-MM-DD (never toISOString().split('T')[0], which is UTC and wrong from 00:00-03:00 in Kenya). Use it everywhere a date is created or compared

## Decisions made after the second audit
- habitNotes: REMOVED (not in the locked design). Can be re-added later by a migration
- habits primary key: TEXT id generated on the device as a UUID (ask before adding expo-crypto; do not install anything without approval). Reason: INTEGER ids restart on reinstall and collide across devices, and they feed Firestore document ids
- habits columns: habitId, userId, habitName, icon, frequencyType ('daily' | 'weekdays'), reminderTime (nullable), source ('user' | 'ai_suggested'), createdAt, updatedAt, deleted, synced
- habitDays(habitId, day): composite primary key, day in mon/tue/wed/thu/fri/sat/sun. Rows exist only for habits with frequencyType = 'weekdays'. Chosen over a JSON column so the schema is in 3NF for logbook Meeting 3
- completions: primary key (habitId, date); columns habitId, date, completed (0/1), updatedAt, synced. No completionId
- Weekday habits on unscheduled days: no completion row is created and the habit is not shown on Home. Backfill only creates rows for scheduled days
- Icons are stable string ids, not emoji. PLACEHOLDER list (to be confirmed): book, water, run, meditate, sleep, food, study, work, music, money, heart, star
- Per-user data: every habit row carries userId (the Firebase uid) and every read filters by the signed-in user
- Local database: a one-time dev wipe is acceptable (test data only). From now on schema changes use versioned migrations via PRAGMA user_version, verified against the Expo SDK 57 expo-sqlite docs
- Schema setup must be awaited before the first query (the local database is now opened and migrated before first render, through getDatabase() in app/_layout.tsx)
- Meeting 2 demo scope: habits add / edit / soft-delete with validation, completion toggle, signup with validation and the age gate. Deferred until after Meeting 2: backfill, onboarding, email/password editing, habit sync
- The habit sync columns (updatedAt, synced, deleted) exist from day one, but the sync work itself is build step 2. That step must also: sync at app launch and right after login, pull data down from Firestore on login (the report promises cross-device preservation), fix the race where a tap during a push is overwritten, and use the same ids as the local keys. Known failures from the old engine (iPhone log, SDK 57): Firestore permission denied on a completions push, and SQLite NOT NULL constraint failed on completions.completed during the merge write. Diagnose first in the sync step.
- If time runs short, cut in this order: Level-Up overlay, Habit Detail, radar chart, Summary charts (keep basic stats), reminders, then trim onboarding from 10 questions. Never cut: auth, habit CRUD, completions, Home, Settings, local-first sync, a minimal onboarding with AI recommendation, the AI insight card, simple XP. This is a risk plan only; the committed scope above has not changed
- iPhone 13 Pro: the App Store Expo Go is SDK 57, as reported by the Expo CLI when the phone opened the project, and the CLI says iOS Expo Go cannot be downgraded. Android: the SDK 55 changelog says Expo Go on Android is installed via the Expo CLI; whether it runs on the Itel A60s (32-bit, Android 12 Go) is not yet confirmed.

## Decisions from the test-strategy audit (2026-11-09)
Decided after the spec red-team in docs/TEST_STRATEGY.md (Part B). Each rule has an "Odd states" line. Pack, reflection, Vitality and area rules are in docs/PACKS_REPORTS_SPEC.md section 17. Fixes land in Phase 1b.
- S-1, monotonic updatedAt (built in Phase 1b): every user write (add, edit, delete, toggle) stamps `updatedAt = max(Date.now(), the row's updatedAt + 1)`, so an edit is never older than the copy it replaces. Reason: with `Date.now()` alone, a phone whose clock is behind (or was moved back) loses its edits: either its own next pull keeps the server copy, or the rules refuse the push ("updatedAt went back").
  - Where: db/stamp.js. The previous value is read by the same SQL statement that writes the new one (`MAX(?, updatedAt + 1)` in updateHabit and softDeleteHabit, `MAX(excluded.updatedAt, completions.updatedAt + 1)` in toggleCompletion's upsert): no extra query, no race. addHabit stamps now (a new row has no previous value). System rows (ensureTodayRows) stay 0; pulled rows keep the remote value; db/devSeed.js (dev only) is unchanged.
  - Stuck rows: rows stamped more than a day ahead (the phone's clock was ahead, so the rules refused them) are re-stamped to now at the start of a push, in one queued transaction (db/syncCore.js restampFutureRows): only this uid's UNSYNCED rows; synced rows and other users' rows are never touched; system rows can't match. Guarded: it runs only when a dirty row has `updatedAt > now + 1 day`, because the statement scans completions (about 13 ms for 100,000 rows on a PC, several times that on the Itel).
  - Clock suspect: a push refusal of a row stamped within the last 24 hours by the phone's clock, in a cycle whose pull reached the end (so no newer server copy is known), marks the cycle "clock suspect". The engine counts such cycles (status `clockSuspectCycles`, memory only): +1 for a cycle that marks it, +1 for each later cycle that reaches the push with no accepted write; unchanged by a cycle that stops before the push or fails (offline); 0 after any accepted write, on sign-out (stop), sign-in (start) and app restart.
  - The one message sync ever shows (the exception to "fail silently"): when `clockSuspectCycles` is 2 or more, Settings shows, muted, directly under its title, the line "Backup paused: your phone's date and time look wrong. Set them to automatic and your changes will back up." One message, wrapping allowed. Never on Home, never a dialog, never on the startup path (a test checks which files read it). It goes after the next accepted push.
  - Known limitation (accepted 2026-11-09): Home's on-time/late status and the completion-time samples read a completion's `updatedAt` as its tick time. After the clock moved back, a tick is stamped previous + 1 ms, and a re-stamped row carries the time of the re-stamp, so those rows can show "late" or drop out of the samples. Only rows whose phone clock was wrong are affected (docs/BUG_LOG.md).
  - Rollback: no schema change. An older bundle stamps `Date.now()` again (the old behaviour), has no re-stamp step (stuck rows stay stuck, as before) and ignores the status field, which is never stored. Stamps written by the new code are valid for it and for the rules; no Firestore rules change.
  - Odd states: a clock behind or moved back (fixed by the rule); a clock more than a day ahead (pushes refused; the Settings line after two cycles; fixed by re-stamping once the clock is right); offline cycles (don't count); two phones editing the same row before either has pulled the other's edit: the higher stamp wins even if it was not the later edit in real time. That last case is a documented last-write-wins limit, not a bug. Tests: tests/clock-skew.test.ts, tests/sync-status-line.test.ts, tests/stamp.test.ts.
- S-2, clock-ahead creation: a habit's `createdDate` is clamped to `min(createdDate, today)` wherever it is computed with `today` (XP, perfect days, streaks, Vitality, the radar, Summary), and only that: no past day is invented for it.
  - Odd states: a habit created while the phone's clock was ahead, then the clock fixed: it counts from today instead of from its future date. Built in Phase 1b (2026-11-10): `clampCreatedDates` in utils/gamification.ts, applied on entry by computeStreaks, countPerfectDays (so XP), dailyCompletion (so Vitality and the radar) and computeSummary. Tests: tests/decided-rules.test.ts (S-2), including a scan that fails if any other app file starts reading createdDate.
- S-6, device settings: the notification settings (`prefs:notifications:v1`) and the celebrations switch (`prefs:celebrations`) are settings of the phone, shared by every account signed in on it, not per account.
  - Odd states: a second account signing in on the same phone keeps the first account's switches. Scheduled reminders themselves are per account: sign-out cancels them. Test: tests/decided-rules.test.ts (S-6, pinned).
- P-8, older code never drops newer fields: every stored record's parser accepts and ignores unknown fields, and a save keeps them, so an OTA rollback or a launch from the embedded bundle can't lose data a newer update added. Exception: the onboarding record keeps its privacy whitelist (only the known fields are written, so answers and Q10 never reach storage).
  - Odd states: a record written by a newer update and re-saved by an older one. Tests: tests/decided-rules.test.ts (P-8; todo until Phase 1b), and the golden-snapshot upgrade tests (Phase 3).

## Later (backlog, design notes only, nothing built)
- Swipe between the main screens (Home, Summary, Profile, Settings) left and right, in addition to the tab buttons, which stay. To settle at design time:
  - Conflicts with horizontal gestures inside the screens: the radar's Week/Month switch, the onboarding-style sliders and any slider added later, and any horizontal scroll (chips, charts, Summary's ranges). Decide which wins, and whether swiping starts only from the screen edge.
  - Accessibility: the tab buttons stay the primary route; swiping is an extra, never the only way. Reduce motion is respected (no slide animation, or a plain fade). TalkBack is unaffected: its own swipe gestures keep moving focus, and no screen depends on the new gesture.
  - Expo Router tabs support: whether the SDK 57 tabs layout can page by swipe without a native dependency (an OTA-only change), or needs a pager or material top-tabs navigator (possibly native, so a store build).
  - Order: whether a swipe follows the tab order (Home, Summary, Profile, Settings), stops at the ends or wraps, and what happens when a screen is pushed over a tab (habit form, reflection, pack edit).