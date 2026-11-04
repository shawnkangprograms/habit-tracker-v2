# HabitQuest: habit packs, reports and report notifications (spec v1, locked)

Companion to ONBOARDING_SPEC.md. Everything here ships as OTA-only changes on Build 2 (fingerprint must stay `d820d50154d72f636213ae4251d04c3f0beb8f8a`, checked right before every publish; `.gitignore` and line endings are fingerprint inputs): no native dependency, app.json, eas.json or package changes. Packs, reports, areas, notes, Vitality and checkups are on-device only; the only things that ever leave the phone are the narrative request in stage 9 (section 8) and, only with the user's consent, short note excerpts (section 12).

## 1. Catalog: 24 habit templates

The 14 existing templates keep their ids and names. Ten are new (names max 30 characters, each with a reason line max 60 characters, written in the stage plan and approved before use). New habits use icon ids from the existing icon set; no new icon assets.

| Pack id | Pack name | Area | Templates |
|---|---|---|---|
| steady_energy | Steady Energy | Health | walk20, stretch10, water_meals, **Eat one fruit or vegetable** |
| calm_mind | Calm Mind | Mind | breathe5, journal3, lights_out, screens_off |
| daily_discipline | Daily Discipline | Discipline | plan_top1, **Make your bed**, **Tidy your space for 5 minutes**, **Set out tomorrow's essentials** |
| career_builder | Career Builder | Career | focus25, skill15, **Track one work win**, **Reach out to one contact** |
| study_sprint | Study Sprint | Learning | study25, review10, **Read for 15 minutes**, **Teach what you learned** |
| close_circle | Close Circle | Relations | message_friend, family_time, **Thank someone today**, **Do one kind thing** |

Rules: a template is in exactly one pack. The Q10 replace habit is in no pack (it is an "other habit" and never counts in pack numbers or reports).

- **Area tag:** every template carries an `area`, which is always its pack's area (the six areas are the six radar axes, section 11). Three templates have an area that differs from the onboarding scoring axis they were given in ONBOARDING_SPEC section 4: lights_out and screens_off (onboarding axis Health, area Mind) and focus25 (onboarding axis Discipline, area Career). The onboarding axis stays as it is for scoring and starter picking; the area is what the radar, packs and reports use.
- **Starter picker (Stage 1):** starters come from the two chosen packs (section 3) instead of the 14-template pool, with the same time-budget caps and count rules as ONBOARDING_SPEC section 4.

## 2. Pack record (on-device only)

Stored in AsyncStorage under `packs:v1:<uid>`, kept on sign-out like the onboarding record, never in Firestore, never synced, never sent anywhere. A new device starts with no packs (known gap, listed in the report).

```
{ version: 1,
  packs: [{ id, kind: 'builtin' | 'custom', builtinId?, name, habitIds: string[],
            dropped: templateId[], createdAt, order }] }
```

- `habitIds` is the explicit membership. A habit is in at most one pack. Deleted habits are ignored when reading.
- `dropped` (built-in only): templates the user removed from the pack, so "Add the rest" and add-suggestions never bring them back.
- No fixed maximum: the number of packs and habits depends on the user's level (section 2b). Pack name: trimmed, 1 to 24 characters, no control characters, unique ignoring case.
- A pack's `createdAt` anchors its yearly report; the combined yearly report uses the earliest `createdAt`.
- Ids for custom packs come from the same generator used for habit ids.
- A corrupt record is treated as "no packs" and left untouched until the user changes something.

## 2b. Limits by level

There is no fixed ceiling. Limits start low and rise as the user levels up, using the app's existing level system (the stage plan must name where the level comes from and confirm it can be read locally without a network call). Two limits only: active habits in total, and packs. There is no per-pack habit cap; a pack can hold as many habits as the total limit allows.

One pure function, `limitsForLevel(level)`, holds the numbers so they can be tuned later without touching anything else. Proposed values: habits = 12 + 2 x (level - 1); packs = 2 + floor((level - 1) / 2).

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Habits | 12 | 14 | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 30 |
| Packs | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 |

Why 12 habits at level 1: the two built-in packs are 8 habits and onboarding can add up to 5 starters, so a new user must not hit the limit during their first session.

Rules:
- Habits that count: all active (not deleted) habits, packed or not.
- Onboarding's own habit creation is never blocked by a limit.
- Every other add path is checked: "Create a habit", a pack screen's "Add habit", "Add the rest", adding from suggestions, creating a pack, adding a built-in pack, and accepting an "Add" suggestion in a report. "Add the rest" adds as many missing habits as fit, in card order, then shows the message; the remainder stays missing.
- Nothing is ever removed. A user above a limit (an existing tester with many habits, habits pulled from another device, or a level that later falls) keeps everything and simply cannot add more. Editing, completing, removing and moving a habit between packs are never blocked and moving does not count as adding.
- Message when blocked, shown in the app when the user taps an add control at the limit: "Habit limit reached. Reach level {x} to add more habits." and "Pack limit reached. Reach level {x} to add more habit packs.", where {x} is the lowest level whose limit is higher than the current one. Add controls stay visible and tappable, and the same message appears as a short caption under them while the limit is reached. The strings go through the same copy approval as every other new string.
- The level is read locally and never at cold start.
- Consequence for notifications (section 6): only the first 4 packs by order get their own report notifications, so the notification count stays bounded however many packs a high-level user has.

## 3. Choosing packs

- **After onboarding:** the two built-in packs for the top two axes (the focus axis, then the next highest score, ties broken in the fixed order Health, Mind, Discipline, Career, Learning, Relations). Computed from the in-memory scores at the results screen. Only the two pack ids and their names are stored; the questionnaire answers and Q10 are not. The packs record is written in the same moment as the onboarding record rule (after the first habit is created, or on Start with nothing selected). Starter habits created in this run whose template belongs to one of the two packs join that pack; other starters are "other habits".
- **Existing users and skippers:** a Home card "Choose your habit packs" lets them pick up to 2 of the 6 built-in packs by hand. Settings has "Manage packs" for everyone.
- **Adopting existing habits:** when a built-in pack is created and the user already has an active, unpacked habit with exactly a template's name, that habit joins the pack instead of a duplicate being offered.
- **"Add the rest"** (built-in packs): creates the pack's missing templates (not adopted, not dropped) through the normal add-habit path, with the default 20:00 reminder, one at a time, stopping at the first failure and never creating a habit twice; the created ids are added to the pack after each success. Permission is requested through the shared reminder permission helper, only after habits exist.

## 4. Home and pack screens

- Home gets a "Your packs" section above the habit list. Each pack is a card: name, "x of n done today", a progress bar, and "Add the rest" when templates are missing.
- Above the existing "Create a habit" button, a new **"Create a habit pack"** button (at the pack limit it stays visible and shows the limit message). Users can still just create habits and never use packs.
- Tapping a pack opens the pack screen: its habits (the same habit card with the same completion toggle), "Add habit", "Edit pack", "Delete pack", links to its reports and to each habit's streak calendar.
- **Edit pack:** rename; remove a habit from the pack (the habit stays, as an "other habit"; for built-in packs the template goes into `dropped`); add an existing habit that is not in any pack; add from suggestions (the pack's missing templates for built-in packs, any catalog template the user does not have for custom packs); "Create a new habit" opens the habit form with the pack preselected.
- **Create a habit pack:** name, then pick habits from the user's unpacked habits and from catalog suggestions; at least 1 habit; or choose "Add a built-in pack" from the six.
- **Delete pack:** confirmation that says the habits are kept. Deleting removes the pack record, its cached reports and its scheduled notifications. A deleted built-in pack can be added again from Manage packs.
- **Habit form:** an optional "Habit pack" row (None or one of the user's packs). Changing it moves the habit between packs.
- With fewer than 2 packs there is no combined report.

## 5. Reports

- **Periods:** week = Monday to Sunday; month = calendar month; year = 12 months after the pack's `createdAt`. A weekly report is available from Monday 00:00 for the week that ended; a monthly report on the 1st; a yearly report on the anniversary. A pack gets a report for a period only if it existed for at least 3 scheduled days of it.
- **Kinds:** one report per pack per period, plus a combined report across all packs per period (pack habits only; "other habits" are never in reports).
- **Contents:** completion percentage and change from the previous period; per-habit completion; best streak (scheduled days only); best weekday; one highlight; 0 to 2 suggestions.
- **Freezing:** a report is computed the first time it is opened (or when its notification is scheduled to fire, whichever comes first) from the pack membership at that moment, then stored and never recomputed, so later edits do not rewrite history. Keep the latest 12 weekly, 12 monthly and 3 yearly per pack and for combined. Stored under `reports:v1:<uid>`, on-device only.
- **Suggestions** (rules, deterministic, offline; only habits with at least 3 scheduled days in the period count):
  - **Ease or remove:** a habit completed on under 30% of its scheduled days in two consecutive periods of the same kind. Shows buttons "Keep it", "Edit habit" and "Remove from pack"; never changes anything by itself.
  - **Add the next habit:** every habit in a built-in pack at 85% or more, and the pack has missing templates not in `dropped`: suggests the next missing template with an "Add" button (default 20:00 reminder).
  - Otherwise a plain "Keep going" line.
- **Where they live:** a Reports screen (newest first) reachable from Home and from Summary, and from each pack screen. Home shows a "New report" card while any report is unread. This replaces the earlier idea of a weekly/monthly insight in Summary.
- The per-habit streak calendar is as designed earlier: 5 weeks, faded non-scheduled days, streaks count scheduled days only.
- The weekly report ends with "Start checkup" (section 14).

## 6. Notifications (local only)

- One-shot local notifications scheduled 8 weeks ahead, refreshed whenever the app opens. The refresh runs after `home:usable`, never during cold start.
- **Weekly:** packs in `order`, one per day starting Monday 18:00, then the combined report the day after the last notified pack. Only the first 4 packs by order are notified (a user with more packs still gets all their reports in the app). With 2 packs: Monday, Tuesday, and Wednesday for combined; at most Friday with 4 notified packs. Monthly and yearly use the same stagger starting on the 1st and on the anniversary.
- **Permission:** asked once, in context, right after packs are first chosen, and only if never asked before. Settings has a "Report reminders" switch (default on). Without permission or with the switch off nothing is scheduled; reports still appear in the app.
- Deleting a pack cancels its notifications; renaming refreshes them.
- **Copy rules:** no data, no numbers, no habit names; the pack name only (it stays on the phone). At most 90 characters. The wording varies, picked in rotation and never the same line twice in a row for the same pack. Copy is in a separate copy table approved before stage 8.
- **Checkups (section 14):** a weekly checkup is announced inside the weekly report notification (no extra notification). A daily checkup has its own optional local notification.
- The Itel may delay or drop scheduled notifications through battery optimisation; this is a device check, not a code gap.

## 7. Isolation and privacy (extends the onboarding rules)

- A new ESLint no-restricted-imports block covers the packs and reports modules (utils/packs, utils/reports, services/packs*, components/packs) and, as they arrive, the areas, notes, Vitality and checkup modules: no `firebase/*`, no `@/sync/*`, no `@/services/insights`, nothing from the startup path. The one exception is the stage 9 narrative module, which may import the callable client and nothing else.
- Nothing from packs, reports, the radar, Vitality or checkups runs during cold start. Home reads them after `home:usable`.
- Pack names, custom habit names, onboarding answers, Q10, first and last names and the areas map never go to Firestore or Gemini. Note free text goes to Gemini only under the consent rule in section 12.

## 8. Gemini narrative (stage 9)

- Rules compute every number and suggestion. Gemini writes only a short narrative (target about 300 characters, server hard limit 450) for a report that already exists, once per report, and the result is stored with the report.
- Sent: report kind and period, the built-in pack name (a custom pack is sent as "your pack"), counts and streaks, and note tags (section 12). Template habits are sent by their template name; other habits as "a habit you added". No user id, no questionnaire answers, and no free text except consented note excerpts (section 12).
- Checkup narratives (section 14) use the same function and fallback.
- A new `kind` in the existing `generateInsight` function with its own daily limit per user and the same refusal handling; deployed with `firebase deploy --only functions:generateInsight` before the client uses it.
- If offline, over limit, busy or failing, the report shows a template sentence and retries later (the existing 30-minute and 60-minute backoff rules). Reports never wait on the network.

## 9. Build stages (each its own OTA, plan first, I review each plan)

Renumbered 2026-11-04 (earlier numbering: 1 packs, 2 management, 3 calendar, 4 reports, 5 notifications, 6 Gemini).

1. Catalog (24 templates, each with its `area` tag) and built-in packs: pure logic, the pack record and store, choosing packs (onboarding hook and the Home card), the pack-based routine screen in onboarding, and the Home "Habit packs" and "Habits" sections with "Add the rest". Also the pure limits-by-level module and the limit message, enforced in "Add the rest" only.
2. Pack management: create, edit and delete packs, Manage packs in Settings, the habit form pack row, and limit enforcement on every other add path (Create a habit, pack creation, suggestions) with the caption under the add controls.
3. Notes and note XP (section 12), including the additive migration and the Settings consent switch (off; nothing is sent before stage 9).
4. Vitality (section 13) on the Home stats card, with the shared per-day completion module.
5. Live radar (section 11): area tags in use, the habit form Area row, the Home card and the Summary radar.
6. Per-habit streak calendar.
7. Report engine (stats, rules, template sentences), Reports screen, the Home "New report" card, and the merged weekly flow with the checkup (section 14).
8. Notification scheduling (reports and the daily checkup), copy table, Settings switches.
9. Gemini narrative (reports and checkups): function change and deploy first, then the client with its fallback.

## 10. Tests

Pure modules in `utils/packs` and `utils/reports` are tested under Node like the onboarding ones: pack selection and tie-breaks, limits by level (table values, next-level lookup, grandfathering users above a limit, onboarding never blocked), name validation, adoption and "Add the rest" with injected add-habit (failure and retry, never twice), removal and `dropped`, membership after habit deletion, period boundaries (Monday weeks, month ends, anniversary with faked dates including the leap day), suggestion thresholds, freezing, notification schedule stagger and rotation, and the privacy rule that no packs or reports module imports forbidden code.

Also, as each stage lands: every template has exactly one area and it equals its pack's area; habit-to-area resolution (packed, unpacked with a stored area, icon pre-fill, "Not counted"); radar scores over the Week and Month windows (scheduled days only, no data, empty area); note validation, note XP (once per habit per day, the 10-character rule) and the AI filter (consent off, replace habits never, 7 excerpts of at most 200 characters); Vitality deltas, clamping, today excluded, creation-day rule and recompute after past edits; checkup question selection, the first-checkup trigger and the schedule settings.

## 11. Live radar

- **Axes:** the six built-in pack areas, in the onboarding radar's order: Learning (study_sprint), Mind (calm_mind), Career (career_builder), Discipline (daily_discipline), Relations (close_circle), Health (steady_energy).
- **Score per area:** the completion rate over the window, counting only scheduled days (the streak calendar's rule): completed scheduled days / scheduled days, over every active habit in that area. Window switch Week (last 7 days, default) / Month (last 28 days); whether today's open day counts is settled in the stage 5 plan. The per-day completion data comes from the same module as Vitality (section 13).
- **Empty states:** an area with habits but no scheduled day in the window shows no data (a gap at that axis, not zero). An area with no habits sits at the centre with "No habits here yet", and tapping it suggests one habit from that area's pack.
- **Habit to area:** a packed habit uses its pack's area (a custom pack's area is chosen when it is created, stage 2). An unpacked habit has an "Area" row in the habit form: the six areas plus "Not counted", pre-filled from its icon (table below), changeable by the user. Stored on the device only as `areas:v1:<uid>` = `{habitId: area | 'none'}`, for unpacked habits only; never Firestore, sync or Gemini. A habit pulled from another device has no stored area and uses the icon pre-fill until the user picks one.
- **Icon to area pre-fill (proposed, awaiting approval):**

| Icon | Area |
|---|---|
| run, water, food, sleep | Health |
| meditate, music | Mind |
| work, money | Career |
| book, study | Learning |
| heart | Relations |
| star | Not counted |

  Discipline has no icon of its own (none of the 12 fits it), so it is only ever chosen by hand or through a pack.
- **Starting outline:** a faint outline of the onboarding Habit Profile behind the live shape, stored as six rounded numbers only (the profile scores, 1 to 5) under `profile:outline:v1:<uid>`. Local, never synced, kept or cleared exactly like the onboarding record (currently kept on sign-out). The answers are still never stored. A retake replaces the outline.
- **The dashed shape today:** on the current onboarding radar the dashed inner polygon is a fixed reference at 2 of 5 on every axis (`RADAR_BASELINE` in utils/onboarding/scoring.ts). It is not user data. On the live radar the faint starting outline takes its place.
- **Where:** a compact radar card on Home above Today (tappable, opens Summary); the full radar with the Week / Month switch on Summary.
- **Motion and cost:** transforms and opacity only, plain fade or none under reduced motion. Computed when the screen is focused, never at cold start; on Home only after `home:usable`.

## 12. Notes and note XP

- **When:** after a habit is ticked, its card shows an inline "Add a note" chip. No modal on tick; the chip never blocks the list or ejects the user. Tapping it opens the note sheet.
- **The sheet:** how it felt (Easy / OK / Hard); optional "what got in the way" chips (Tired, Busy, Forgot, Not in the mood, Other); optional free text up to 280 characters. One note per habit per day, editable that day.
- **XP:** a note earns XP when it has at least one tag (feeling or obstacle) or free text of at least 10 characters (trimmed), once per habit per day. A completion is worth 10 XP (`XP_PER_COMPLETION` in utils/gamification.ts), so a note is worth **2 XP** (one fifth). Like all XP it is derived, never stored: it counts only while that day's completion is ticked, and it goes when the note does.
- **Storage:** a new local SQLite table (additive migration through `PRAGMA user_version`, no change to existing tables): one row per habit per day, with the feeling, the obstacle tags, the text and timestamps. Never synced. Deleted when its habit is deleted. On sign-out it follows the same rule as the user's other local rows (kept per user id).
- **AI rule:** tags always feed the analysis (counts only). Free text reaches Gemini only when the user turns on "Use my notes in AI summaries" in Settings (off by default), with consent wording that says the text is processed outside Kenya. Only recent short excerpts are sent: at most the last 7 notes, at most 200 characters each. Notes on replace habits (from Q10: phone and social, pornography, smoking or vaping, gaming, junk food, alcohol, procrastination, matched by name since Q10 is never stored) never go to AI, whatever the switch says. Habit names are still never sent.

## 13. Vitality

- A bar on the Home stats card, named Vitality (Health is a radar axis).
- **Computed from history, never stored.** It starts at 50 on the first day after the first habit exists. For each closed day with at least one scheduled habit: delta = round(10 x share of scheduled habits done) - 4, so +6 for a full day, +1 for half, 0 at 40%, -4 for none. The value is clamped to 0 to 100 after each day.
- Today does not count until it closes (local midnight). Days with no scheduled habit change nothing. A habit counts only from the day it was created. Edits to past days recompute it (it is derived).
- No game over. A low bar shows "Low. Today is a fresh start."
- It uses the same per-day completion module as the radar (section 11).
- **Strings (proposed, awaiting approval):** label "Vitality"; value "{n} / 100"; low (under 25) "Low. Today is a fresh start."; steady (25 to 74) "Steady. Keep the days ticking."; high (75 and over) "Strong. You're on a roll."; before the first closed day "Starts after your first full day."; accessibility "Vitality {n} out of 100".

## 14. Checkup (merged into the weekly report)

- The weekly report ends with "Start checkup": at most 5 tap-to-answer questions.
- Questions and recommendations come from local rules over note tags, missed days and streaks: shrink a habit, move its time, or add one from a pack. Gemini only writes the narrative, in stage 9, with the template fallback.
- **First checkup:** a Home card (never a pop-up), shown the first time the user completes all of a day's habits, or 24 hours after sign-up, whichever comes first. It works from the chosen packs and habits, since the onboarding answers are not stored.
- **Settings:** Checkup Off / Daily / Weekly (default Weekly), with time and weekday. Weekly checkups are announced inside the weekly report notification (no extra notification). Daily is one question as a Home card, with its own optional local notification.
- **Storage:** answers stored locally as `checkups:v1:<uid>`, never synced.

## 15. Names (shipped in Stage 0c)

- First and last name are asked at sign-up and editable in Settings > Your name; stored on the user's own users document, as Auth displayName and as a copy on the device; used only for the Home greeting (docs/HABITQUEST_DESIGN.md).
- **Backlog:** add "Name" to the privacy policy and to the Play Data safety form.
