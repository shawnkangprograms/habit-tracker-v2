# HabitQuest (habit-tracker-v2) — Locked Design Decisions

Single source of truth. If code and this file disagree, flag it; do not silently pick one.
The detailed CRUD + validation rule tables are in the published doc:
https://claude.ai/artifact/AupM7DJ3Fcw5b746p54JJc

## Stack and environment
- Expo SDK 57 (Expo Go compatible), Expo Router, React Native, TypeScript/JS mix
- Local SQLite (expo-sqlite) is the source of truth; Firebase (Auth + Firestore) for backup/sync
- Dev on Windows/PowerShell/VS Code. Test devices: iPhone 13 Pro (iOS 26), Itel A60s (Android 12 Go, 32-bit)
- Folder structure: type-based (/components, /db, /sync, /services); screens live in /app per Expo Router

## Architecture
- Local-first: all reads/writes hit SQLite; sync is background and must fail silently (no error shown to user)
- Tables: habits, habitDays (normalised weekday rows, no JSON arrays), completions (composite primary key habitId + date). Completions use an explicit row per habit per day with completed true/false (not insert-on-complete)
- Sync tracking: a `synced` flag on each row, set false on local write, true after successful push; only unsynced rows are pushed
- Sync triggers: app foreground + every 5 minutes while open. No network-reconnect listener in v1 (avoids netinfo dependency)
- Conflict rule (revised after code audit; replaces the earlier sticky-true rule): last-write-wins on a per-row `updatedAt` (ms timestamp). Only user toggles set `updatedAt = Date.now()`. System-generated rows (ensureTodayRows / backfill) get `updatedAt = 0` so they can never overwrite a real user action from another device or a previous install. Reason: sticky-true made unchecking impossible once a true had synced
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
Full Figma prototype scope: Sign In/Up, 10-question onboarding, building-profile screen, 6-axis radar "Habit Profile", recommended routine, Home with XP progress ring, Habit Detail, Summary (day/week/month/year), Settings (profile merged in), Level-Up overlay, bottom tabs Home/Summary/Settings. The Figma file has NO Add/Edit Habit screen; design it in the same visual language. XP is derived from completion count (no table). Splash: Expo native splash only
- Out of scope: social/multi-user, monetization, full encryption, account deletion

## Build order and testing
1. Data model + rough UI (with validation) -> 2. sync with last-write-wins -> 3. AI Cloud Function -> 4. polish pass -> charts only if time remains
- Tests: 3-5 unit tests for the sync conflict-merge function only; everything else manual

## Decisions made after the first code audit
- Naming: keep the existing camelCase in code and SQLite (habitId, habitName, reminderTime). The snake_case names in the validation doc are descriptive only
- Conflict rule: last-write-wins on updatedAt (see Architecture)
- Age gate: a required age field on the signup form, validated 18-99 BEFORE calling createUserWithEmailAndPassword, so no account is ever created for an under-18 user. Store age as a number. If onboarding includes an age-range question, it must not offer an under-18 option
- firstName/lastName: remove from signup and from the Firestore users document (not in the design; data minimisation)
- Dates: one shared helper that returns the LOCAL date as YYYY-MM-DD (never toISOString().split('T')[0], which is UTC and wrong from 00:00-03:00 in Kenya). Use it everywhere a date is created or compared

## Decisions made after the second audit
- habitNotes: REMOVED (not in the locked design). Can be re-added later by a migration
- habits primary key: TEXT id generated on the device as a UUID (ask before adding expo-crypto; do not install anything without approval). Reason: INTEGER ids restart on reinstall and collide across devices, and they feed Firestore document ids
- habits columns: id, userId, name, icon, frequencyType ('daily' | 'weekdays'), reminderTime (nullable), source ('user' | 'ai_suggested'), createdAt, updatedAt, deleted, synced
- habitDays(habitId, day): composite primary key, day in mon/tue/wed/thu/fri/sat/sun. Rows exist only for habits with frequencyType = 'weekdays'. Chosen over a JSON column so the schema is in 3NF for logbook Meeting 3
- completions: primary key (habitId, date); columns habitId, date, completed (0/1), updatedAt, synced. No completionId
- Weekday habits on unscheduled days: no completion row is created and the habit is not shown on Home. Backfill only creates rows for scheduled days
- Icons are stable string ids, not emoji. PLACEHOLDER list (to be confirmed): book, water, run, meditate, sleep, food, study, work, music, money, heart, star
- Per-user data: every habit row carries userId (the Firebase uid) and every read filters by the signed-in user
- Local database: a one-time dev wipe is acceptable (test data only). From now on schema changes use versioned migrations via PRAGMA user_version, verified against the Expo SDK 57 expo-sqlite docs
- Schema setup must be awaited before the first query (initializeSchema is currently not awaited in app/_layout.tsx)
- Meeting 2 demo scope: habits add / edit / soft-delete with validation, completion toggle, signup with validation and the age gate. Deferred until after Meeting 2: backfill, onboarding, email/password editing, habit sync
- The habit sync columns (updatedAt, synced, deleted) exist from day one, but the sync work itself is build step 2. That step must also: sync at app launch and right after login, pull data down from Firestore on login (the report promises cross-device preservation), fix the race where a tap during a push is overwritten, and use the same ids as the local keys
- If time runs short, cut in this order: Level-Up overlay, Habit Detail, radar chart, Summary charts (keep basic stats), reminders, then trim onboarding from 10 questions. Never cut: auth, habit CRUD, completions, Home, Settings, local-first sync, a minimal onboarding with AI recommendation, the AI insight card, simple XP. This is a risk plan only; the committed scope above has not changed
- iPhone 13 Pro: the App Store Expo Go is SDK 57, as reported by the Expo CLI when the phone opened the project, and the CLI says iOS Expo Go cannot be downgraded. Android: the SDK 55 changelog says Expo Go on Android is installed via the Expo CLI; whether it runs on the Itel A60s (32-bit, Android 12 Go) is not yet confirmed.