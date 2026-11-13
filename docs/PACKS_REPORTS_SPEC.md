# HabitQuest: habit packs, reports and report notifications (spec v1, locked)

Companion to ONBOARDING_SPEC.md. Everything here ships as OTA-only changes on Build 2 (fingerprint must stay `d820d50154d72f636213ae4251d04c3f0beb8f8a`, checked right before every publish; `.gitignore` and line endings are fingerprint inputs): no native dependency, app.json, eas.json or package changes. Packs, reports, areas, reflections, Vitality and checkups are on-device only; the only things that ever leave the phone are the narrative request in stage 9 (section 8), with reflection tags and, only with the user's consent, short reflection excerpts (section 12). Before stage 9 nothing of them leaves the phone.

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

- **Area tag:** every template carries an `area`, which is always its pack's area (the six areas are the six radar axes, section 11). Three templates have an area that differs from the onboarding axis they were given in ONBOARDING_SPEC section 4: lights_out and screens_off (onboarding axis Health, area Mind) and focus25 (onboarding axis Discipline, area Career). The onboarding axis stays in the catalog as data; the area is what packs, starter picking, the radar and reports use.
- **Starter picker (Stage 1a):** starters come from the two chosen packs (section 3) instead of the 14-template pool, with the same time-budget caps and count rules as ONBOARDING_SPEC section 4. The two packs' templates are taken in turn (focus pack first, then the second pack, in card order). The forced sleep pick still comes from Calm Mind when that pack was not chosen, and is then an "other habit". Only when every template left in both packs is already picked (a retake) does the rest of the catalog fill in, by area rank, as other habits. Study Sprint has one template of 5 minutes or less (teach_back, 5 minutes since 2026-11-04), so with "About 5 minutes" a Learning focus gets that one plus the second pack's short templates, which can be fewer picks than the count.

## 2. Pack record (on-device only)

Stored in AsyncStorage under `packs:v1:<uid>`, kept on sign-out like the onboarding record, never in Firestore, never synced, never sent anywhere. A new device starts with no packs (known gap, listed in the report).

```
{ version: 1,
  packs: [{ id, kind: 'builtin' | 'custom', builtinId?, name, habitIds: string[],
            dropped: templateId[], createdAt, order }] }
```

- `habitIds` is the explicit membership. A habit is in at most one pack. Deleted habits are ignored when reading.
- `dropped` (built-in only): templates the user removed from the pack, so "Add the rest" and add-suggestions never bring them back.
- No fixed maximum: the number of packs and habits depends on the user's level (section 2b). Pack name: trimmed, inner spaces collapsed, 1 to 24 characters, no control characters, unique ignoring case.
- A custom pack also stores `area` (one of the six, chosen at creation, Stage 2); a built-in pack's area comes from its `builtinId` and is never stored.
- A pack's `createdAt` anchors its yearly report; the combined yearly report uses the earliest `createdAt`.
- Ids for custom packs come from the same generator used for habit ids.
- A corrupt record is treated as "no packs" and left untouched until the user changes something. A record that couldn't be read (the storage call failed) is never written over (R-1, section 17): the change is refused, and the picker, the pack edit screen and pack delete show their existing alerts ("Couldn't save pack" / "Couldn't delete pack", "Something went wrong. Please try again.") and stay open.
- Fields this build doesn't know are kept when it re-saves the record, on the record and on each pack, and the mirror's copy of the record keeps them too (P-8, section 17).

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
- The first onboarding run is never blocked by a limit. A Settings retake (and "Add your own habit", which goes through the habit form) is checked: the selected cards are created while there is room, then the habit limit message shows under Start.
- One shared check, `checkAdd({level, kind, count})` in utils/packs/limits.ts (Stage 2), used by every add path: "Add a habit" and the habit form when adding, "Create a habit pack" and the pack edit screen when creating, the picker (built-in packs and "Create your own pack"), "Add the rest", a Settings retake, and later any template-adding path (a report's "Add" suggestion). "Add the rest" adds as many missing habits as fit, in card order, then shows the message; the remainder stays missing.
- Screens that don't hold the level read it through services/packLimits.ts, which uses only the gamification stats (statsStore over db/gamification.js), so a change to the XP curve (section 16) flows through without touching the limits.
- Nothing is ever removed. A user above a limit (an existing tester with many habits, habits pulled from another device, or a level that later falls) keeps everything and simply cannot add more. Editing, completing, removing and moving a habit between packs are never blocked and moving does not count as adding (section 16: limits only ever block adding).
- Message when blocked, shown in the app when the user taps an add control at the limit: "Habit limit reached. Reach level {x} to add more habits." and "Pack limit reached. Reach level {x} to add more habit packs.", where {x} is the lowest level whose limit is higher than both the current limit and the current count (so an account above its limit, for example after a level drop or with habits pulled from another device, is told the level it actually needs: 23 habits at level 3 names level 7, not 4). One helper builds the message for every add path (`limitMessageFor` in utils/packs/limits.ts). Add controls stay visible and tappable, and the same message appears as a short caption under them while the limit is reached. The strings go through the same copy approval as every other new string.
- The level is read locally and never at cold start.
- Consequence for notifications (section 6): only the first 4 packs by order get their own report notifications, so the notification count stays bounded however many packs a high-level user has.

## 3. Choosing packs

- **After onboarding (Stage 1a):** the two built-in packs for the top two axes (the focus axis, then the next highest score, ties broken in the fixed order Health, Mind, Discipline, Career, Learning, Relations). Computed from the in-memory scores at the results screen. Only the two pack ids and their names are stored; the questionnaire answers and Q10 are not. The packs record is updated right after each onboarding record save (after each habit is created, and when the user's own habit is the first one); never on Skip. Whether a run creates the packs follows the next rule. Its failure is swallowed and never blocks onboarding, and onboarding never checks a limit. Starter habits created in this run whose template belongs to one of the user's packs join that pack (unless the template is in that pack's `dropped`); other starters, the Q10 replace habit and habits made with "Add your own habit" are "other habits". The Recommended Routine groups its cards the same way: under each pack's name, then "Other habits", with the subtitle "Built from your packs: {pack A} and {pack B}." when the run uses both chosen packs.
- **When packs are created:** whenever the user has no packs (no record, or a record with no packs) and the run has created at least one habit (a starter or the user's own): the first run, a Settings run after a skip, and accounts that finished onboarding before packs existed. The two chosen packs are created and same-named unpacked habits are adopted. Start with nothing selected creates no packs. When a packs record with packs already exists, a retake only adds starters to built-in packs the user already has and never creates new ones. Skip never writes packs. A corrupt record is never written over.
- **Existing users and skippers (Stage 1b):** a Home card "Choose your habit packs" lets them pick up to {n} of the 6 built-in packs by hand, where {n} is the pack limit for their level (section 2b). The same picker opens from Settings > "Habit packs" for everyone. Packs the user already has show as picked and can't be unpicked there (they are edited or deleted from their Home card, section 4); a pick that would go past the limit is refused with the pack limit message. Saving adds the new packs after the existing ones and adopts same-named habits (next rule); a corrupt record is replaced, since saving is the user changing something. Stage 2 adds "Create your own pack" to the picker; there is no separate "Manage packs" screen.
- **Custom packs (Stage 2):** created from Home or the picker (section 4), with a name, an area and any of the user's habits (none is fine). Their id comes from the habit id generator.
- **Adopting existing habits:** when a built-in pack is created and the user already has an active, unpacked habit with a template's name, that habit joins the pack instead of a duplicate being offered. Names match after trimming, collapsing inner spaces and ignoring case. In onboarding, only habits that existed before the run are adopted.
- **"Add the rest"** (built-in packs): creates the pack's missing templates (not adopted, not dropped) through the normal add-habit path, with the default 20:00 reminder, one at a time, stopping at the first failure and never creating a habit twice; the created ids are added to the pack after each success. Permission is requested through the shared reminder permission helper, only after habits exist. It waits for this uid's first pull on this phone (S-4), and a template whose only habit was renamed counts as dropped (P-2); section 17.

## 4. Home and pack screens

- **Home (Stage 1b):** below "Today.", a **"Habit packs"** section of expandable pack cards, then a **"Habits"** section for unpacked habits due today; "Other days" is unchanged. Collapsed, a card shows the pack name, "{x} of {n} done today" (or "Nothing scheduled today"), a progress bar and a chevron. Expanded (the default, remembered in memory for the app run), it shows the pack's habits due today with Home's own completion toggle, and "Add the rest" when templates are missing. No height animation; the bar and chevron use transforms only. There is no separate pack screen in stage 1: the expandable cards replace the earlier read-only pack screen. A packed habit appears only inside its pack. With no packs, Home has neither section header and looks as before. Home has the packs on its first render from the mirror (section 7); only when the mirror is for another account or missing is the record read after `home:usable`, and Home shows its habits unpacked until then. "Add the rest" takes the level from the stats Home already loaded (one local computation if that load failed; level 1 if that fails too), creates the missing templates daily at 20:00 and asks for reminder permission through the shared helper once one was created; while the habit limit is reached the limit message shows as a caption under it.
- **"Choose your habit packs" card (Stage 1b):** below "Today.", for users with at least one active habit and no packs (no record, an empty one, or a corrupt one). It appears with the stats card, so {n} is the real pack limit. Buttons "Choose packs" (opens the picker) and "Not now". "Not now" is stored per user on this phone under `packs:chooseDismissed:v1:<uid>` (value `1`) and copied into the mirror, so the card never flashes on a later launch; it is never synced and never cleared on sign-out. Settings > "Habit packs" still opens the picker after "Not now".
- **"Create a habit pack" (Stage 2):** on Home, a dashed row with the grid-plus icon in the "Habit packs" section, directly below the last pack card; "Add a habit" stays alone as the last item of the "Habits" list. With no packs and the "Choose your habit packs" card not showing (dismissed, or a skipped account), the "Habit packs" header shows with only the create row under it (then "Habits"); this waits until the packs and stats are known, so it never shows and then gives way to the card. While the choose card or the first-run card shows, the create row is hidden. Users can still just create habits and never use packs. At the pack limit it stays tappable, opens nothing, and the pack limit message shows as a caption directly under it; "Add a habit" does the same with the habit limit message under it.
- **One screen for create and edit (Stage 2, app/packs/edit.tsx), three ways in:** "Create a habit pack" on Home, "Create your own pack" in the picker (Settings > "Habit packs"; within the same pack limit, counting unsaved picks), and the "Edit pack" pencil on each Home pack card (its own button beside the chevron). There is no separate pack screen.
  - Titles "New pack" / "Edit pack"; labels "PACK NAME", "AREA", "HABITS"; placeholder "e.g. Morning routine"; a {n}/24 counter. Back reads "Home" or "Habit packs".
  - **Pack name:** trimmed, inner spaces collapsed (a pasted line break becomes a space), 1 to 24 characters, unique ignoring case among the user's packs. Errors "Give your pack a name.", "Use 24 characters or fewer.", "You already have a pack with that name.", shown once the user types or leaves the field; Save is disabled until the name is valid and a new pack has an area.
  - **Area:** Health, Mind, Discipline, Career, Learning, Relations, chosen at creation with the note "You can't change the area later.", then read-only (the radar history depends on it). A built-in pack's area is its own. A custom pack stores `area`; one without a valid area (a rollback to an older update could drop it) reads as having none and can pick one once.
  - **Habits:** every active habit as a checklist. A habit in another pack shows "In {pack}"; ticking it moves it here (a habit is in at most one pack). With no habits: "No habits to add yet. You can add some later." Empty packs are allowed; their Home card shows "No habits yet" (a pack whose habits aren't due today keeps "Nothing scheduled today").
  - **Built-in packs** are edited and deleted like any other and can be picked again later; their area stays fixed. Unticking a habit from a built-in pack, or moving it to another pack, puts its template in that pack's `dropped`; putting it back takes it out.
  - Save buttons "Create pack" / "Save changes". Creating checks the pack limit and shows the pack limit message above Save. Everything is one store write (record and mirror). Failures: "Couldn't save pack" with "Something went wrong. Please try again."; a pack deleted meanwhile: "Pack not found" / "This pack no longer exists.".
- **Delete pack (edit mode only):** "Delete pack" opens "Delete this pack?" / "Its habits stay on your Home screen under Habits." with "Delete pack" and "Cancel". Habits are never deleted with a pack. Deleting the last pack also saves the choose card's "Not now" in the same write, so the card doesn't come straight back. Failure: "Couldn't delete pack". Deleting a habit takes it out of its pack (ids of deleted habits are ignored on read). Its reports and notifications go with it once those stages exist.
- **Habit form:** a "HABIT PACK" row of chips, "None" plus the user's packs in order, shown once the user has packs. Changing it moves the habit between packs (same `dropped` rule), saved after the habit. The habit limit is checked only when adding, never when editing; at the limit the message shows above Save and nothing is created.
- With fewer than 2 packs there is no combined report.
- **At launch (cold-start flash fix):** nothing may say something untrue and the layout must not jump. Until Home's first habit load, pack cards (from the mirror) show their name, a blank status line and an empty bar, and an expanded card shows one plain placeholder block per habit id in its saved record (no cap; collapsed cards stay collapsed). "Create a habit pack", "Habits" and "Add a habit" appear once habits are known. The stats card's exact space is held by an empty card until the first stats load finishes (removed if that load fails, as before). utils/homeLoading.ts holds the rules. Known remaining moves: the "Choose your habit packs" card appears once data is known, and the insight card after home:usable. **Backlog:** a "shown last time" flag for the insight card in the existing startup read, so its space can be held too.

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

- A new ESLint no-restricted-imports block covers the packs and reports modules (utils/packs, utils/reports, services/packs*, components/packs) and, as they arrive, the areas, reflections (Stage 3: utils/reflections, services/reflectionsStore*, services/gamificationStats.ts, components/reflections, hooks/use-reflection-bar.ts, app/reflect.tsx), Vitality and checkup modules: no `firebase/*`, no `@/sync/*`, no `@/services/insights`, nothing from the startup path. The one exception is the stage 9 narrative module, which may import the callable client and nothing else; it is the one audited export path for reflections.
- Nothing from packs, reports, the radar, Vitality or checkups runs during cold start. Home reads them after `home:usable`, with one exception (amended in Stage 1a, so Home never shows a flat list that then regroups into packs): the canonical pack record stays per user at `packs:v1:<uid>`, and a mirror copy `{uid, record}` under the fixed key `packs:mirror:v1` is read in the sign-in marker's existing `multiGet`, as the greeting's name is (zero extra native calls). The mirror is used only if its uid matches the signed-in user; otherwise the canonical record is read and the mirror rebuilt from it. Every pack write saves both keys in one `multiSet`. A corrupt record is mirrored as corrupt, so the mirror never hides it. Stage 1b adds the choose card's "Not now" flag to the mirror (`{uid, record, dismissed}`; a mirror without it reads as not dismissed); "Not now" saves its own key and the mirror in one `multiSet`, and rebuilding the mirror for another uid reads both keys.
- Pack names, custom habit names, onboarding answers, Q10, first and last names and the areas map never go to Firestore or Gemini. Reflection free text goes to Gemini only under the consent rule in section 12.

## 8. Gemini narrative (stage 9)

- Rules compute every number and suggestion. Gemini writes only a short narrative (target about 300 characters, server hard limit 450) for a report that already exists, once per report, and the result is stored with the report.
- Sent: report kind and period, the built-in pack name (a custom pack is sent as "your pack"), counts and streaks, and reflection tags (section 12). Template habits are sent by their template name; other habits as "a habit you added". No user id, no questionnaire answers, and no free text except consented reflection excerpts (section 12).
- Checkup narratives (section 14) use the same function and fallback.
- A new `kind` in the existing `generateInsight` function with its own daily limit per user and the same refusal handling; deployed with `firebase deploy --only functions:generateInsight` before the client uses it.
- If offline, over limit, busy or failing, the report shows a template sentence and retries later (the existing 30-minute and 60-minute backoff rules). Reports never wait on the network.

## 9. Build stages (each its own OTA, plan first, I review each plan)

Renumbered 2026-11-04 (earlier numbering: 1 packs, 2 management, 3 calendar, 4 reports, 5 notifications, 6 Gemini). Revised 2026-11-05: stage 2 adds limit enforcement, stage 3 adds the reflection prompt and the XP rebalance (section 16).

1. Catalog (24 templates, each with its `area` tag) and built-in packs, split in two OTAs:
   - **1a:** the catalog, built-in packs, the pure modules (record, builtin, choose, membership, addRest, limits, copy), the pack store and its mirror, the pack-constrained starters, the grouped routine screen, the packs record written with the onboarding record, and the ESLint block and isolation test. Home stays a flat list.
   - **1b:** the Home "Habit packs" and "Habits" sections with expandable pack cards, the "Choose your habit packs" card and picker, and "Add the rest" (the only add path that enforces the limit in stage 1).
2. Pack management and limits: create, edit and delete packs, the habit form pack row, and limit enforcement on every add path through one shared function, with the caption under the add controls. Over-limit accounts keep everything (section 16).
3. Reflections and XP rebalance: the reflection bar and screen, reflection XP and the on-device record (section 12), and the XP rebalance (section 16). Nothing leaves the phone in this stage; the consent switch moved to stage 9.
4. Vitality (section 13) on the Home stats card, with the shared per-day completion module (built).
5. Live radar (section 11): area tags in use, the habit form Area row, the Home card and the Summary radar (built).
6. Per-habit streak calendar.
7. Report engine (stats, rules, template sentences), Reports screen, the Home "New report" card, and the merged weekly flow with the checkup (section 14).
8. Notification scheduling (reports and the daily checkup), copy table, Settings switches.
9. Gemini narrative (reports and checkups): function change and deploy first, then the client with its fallback. Also in this stage: the Settings switch "Use my notes in AI summaries" (off by default; the consent wording says the text is processed outside Kenya), the one audited reflection export path (section 12), and a checklist item to revisit the reflection screen's intro line ("Four quick taps.") and the privacy policy.

## 10. Tests

Pure modules in `utils/packs` and `utils/reports` are tested under Node like the onboarding ones: pack selection and tie-breaks, limits by level (table values, next-level lookup, grandfathering users above a limit, onboarding never blocked), name validation, adoption and "Add the rest" with injected add-habit (failure and retry, never twice), removal and `dropped`, membership after habit deletion, period boundaries (Monday weeks, month ends, anniversary with faked dates including the leap day), suggestion thresholds, freezing, notification schedule stagger and rotation, and the privacy rule that no packs or reports module imports forbidden code.

Also, as each stage lands: every template has exactly one area and it equals its pack's area; habit-to-area resolution (packed, unpacked with a stored area, icon pre-fill, "Not counted"); radar scores over the Week and Month windows (scheduled days only, no data, empty area); reflection validation, reflection XP (20 while ticked, one per habit per day, 3 a day, un-tick removes it), the level curve, the milestone table and an existing account recalculated from history (Stage 3), and in stage 9 the AI filter (consent off, replace habits never, 7 excerpts of at most 200 characters); Vitality deltas, clamping, today excluded, creation-day rule and recompute after past edits; checkup question selection, the first-checkup trigger and the schedule settings.

## 11. Live radar

Built in Stage 5.

- **Axes:** the six built-in pack areas, in the onboarding radar's order: Learning (study_sprint) at the top, then clockwise Mind (calm_mind), Career (career_builder), Discipline (daily_discipline), Relations (close_circle), Health (steady_energy).
- **Score per area:** done / scheduled over the window's closed days, summed over every active habit in that area, with the per-day counts from utils/dailyCompletion.ts (the perfect-day rule: deleted habits are ignored, a habit counts from its creation day, rest days add nothing, so they never count against an axis). Today never counts. Window Week = the last 7 closed days (default), Month = the last 28 closed days. Summary's own stats keep their 30-day month; only the radar uses 28. Derived on every load (Home's stats load, Summary's load), never stored. Maths in utils/radar/score.ts.
- **Axis states:** a score; **no data** (the area has habits but none was scheduled in the window); **empty** (no habits in the area). An axis without a score sits at the centre of the shape with a dashed spoke and no dot. When no axis has a score the radar shows "Starts after your first full day." instead of a shape.
- **Habit to area** (utils/radar/areas.ts), first match wins: the habit's pack's area; for a habit in no pack, or in a custom pack with no area, the value stored on this phone; otherwise the icon pre-fill below. The habit form shows an "AREA" row (Health, Mind, Discipline, Career, Learning, Relations, Not counted; helper "Used for your radar. Habits in a pack use the pack's area.") whenever the selected pack has no area (None, no packs, or an area-less custom pack), pre-filled from the icon until the user picks one; a pick is saved after the habit, and a failed save leaves the icon's area.
- **Area map:** `areas:v1:<uid>` = `{habitId: area | 'none'}` in AsyncStorage, on this phone only: never Firestore, sync or Gemini, kept on sign-out like the packs and reflections records. A habit pulled onto a new phone has no entry and falls back to the icon pre-fill. Entries of habits later moved into a pack (where the pack wins) are left in place; entries of habits known to be deleted (SQLite `deleted = 1`) are pruned at the next area write, readable or kept unreadable ones alike (R-1, section 17); entries of habits not on this phone are kept. It is read once per app run inside the stats load, in parallel with SQLite; a failed or corrupt read counts as an empty map, never as a stats failure, and a map that couldn't be read is never written over (the area save then fails silently and the habit keeps its icon's area). An entry whose value this build can't read (written by a newer build) is not used but is kept by the next write; setting that habit's area replaces it (P-8, section 17).
- **Icon to area pre-fill (approved):**

| Icon | Area |
|---|---|
| run, water, food, sleep | Health |
| meditate, music | Mind |
| work, money | Career |
| book, study | Learning |
| heart | Relations |
| star | Not counted |

  Discipline has no icon of its own (none of the 12 fits it), so it is only ever chosen by hand or through a pack.
- **Starting outline:** the onboarding Habit Profile as six whole numbers 1 to 5 under `profile:outline:v1:<uid>`, written by onboarding's results step (when the plan is built, before the Habit Profile shows) on every run that reaches it: the first run (opened from Home after sign-up or by the onboarding gate) and a Settings retake, which replaces it. Written from the in-memory scores, clamped 1 to 5; a failed write is ignored and never blocks onboarding. The answers are still never stored. Kept or cleared like the onboarding record (currently kept on sign-out). Drawn faintly (dashed, muted) behind the live shape on the Summary radar only, whenever one is stored; nothing is drawn when none is. Accounts that onboarded before Stage 5 have none until a retake. Replace-only (P-8, section 17): a write replaces the stored outline and carries none of its keys, since anything a newer build stored beside the scores would describe the outline being replaced.
- **The dashed shape on the onboarding radar** is a fixed reference at 2 of 5 on every axis (`RADAR_BASELINE` in utils/onboarding/scoring.ts). It is not user data.
- **Where:**
  - Home: a compact card below the habit lists (after "Other days"), at a fixed height whose space is held by an empty placeholder until the first stats load has finished. Left: a small radar without labels or outline, with "Last 7 days" or "Last 28 days" directly under it. Right: "Habit radar", "Strongest: {area} {n}%", and "Needs care: {area} {n}%" only when the lowest scored axis is below 75% and is not the strongest (ties: the first in axis order), then a Week/Month switch. The radar and the text open Summary.
  - Summary: directly after the Week bars / Month heat strip and before "By habit", under its own "Habit radar" header (hidden whenever Summary shows its empty card): the full radar with two-line labels (line 1 the area name, line 2 "{n}%" or "–", 12 px, the label colour), the starting outline, the window caption directly under it, then one row per area: its percentage and "{done} of {scheduled}", "No data", or "No habits here yet". Summary's Week/Month toggle drives it; there is no second switch. The Home compact radar has no labels.
  - One Week/Month choice in memory, shared by both, Week after every launch.
  - "Try {template}" for an empty area is deferred.
- **Accessibility:** every value in words, never colour alone: "Habit radar, last 7 days: Learning no data, Mind 100 percent, … Relations no habits yet." (or "…: Starts after your first full day."). On Home it is the card button's label, with the hint "Opens Summary"; the switch is its own control.
- **Small screens:** the two-line labels have their own fit (utils/radar/fit.ts, fitRadarTwoLine; the onboarding radar keeps fitRadar unchanged). The radius is sized from the wider line of each label (the area names), with the onboarding radar's conservative width estimate, and the drawing has room for a two-line label above the shape and one below; side labels grow away from it, upper ones stacking upward and lower ones downward. Every label fits at 300 to 430 dp (tested). Radius: 57 px at 300 dp, 68 at 320, 91 at 360 (the Itel, pinned in the tests), 100 (the maximum) at 430. One-line "{Area} 100%" labels had left 12, 23, 46 and 87.
- **Motion and cost:** the live shape fades and grows from the centre once (opacity and transform only); none under reduce motion. No extra SQL query; nothing computed is stored.

## 12. Reflections and reflection XP

Rewritten in Stage 3 (replaces "Notes and note XP": the inline "Add a note" chip, the note sheet, 2 XP per note and the SQLite table).

- **When:** after the user's own completing tick on Home, a bar at the bottom of Home offers a reflection on that habit (section 16). It is the only way in.
- **The screen:** a full-screen route (app/reflect.tsx, not a sheet; swipe-back off; Android Back and the back row ask before dropping answers). Title "Reflect", the habit name, intro "Four quick taps.", then four one-tap questions and one optional free-text field:

| Question | Answers (stored tag) |
|---|---|
| How did it feel? | Easy (`easy`), OK (`ok`), Hard (`hard`) |
| How much did you do? | All of it (`all`), Most of it (`most`), A little (`little`) |
| What helped most? | A reminder (`reminder`), My routine (`routine`), Someone else (`someone`), Just me (`self`) |
| Did anything get in the way? | Nothing (`none`), Tired (`tired`), Busy (`busy`), Low mood (`mood`), Other (`other`) |

  Free text "ANYTHING ELSE? (OPTIONAL)", placeholder "A few words for yourself", at most 200 characters after trimming (control characters removed, line breaks kept), counter "{n}/200", error "Use 200 characters or fewer.". "Save reflection" is enabled once all four questions are answered. One reflection per habit per day; not editable in Stage 3.
- **XP:** 20 per reflection (`REFLECTION_XP`), earned by answering the four questions; the free text never affects XP. It counts only while that day's completion of the habit is ticked, and at most 3 a day (the earliest saved among those that count). Like all XP it is derived, never stored: un-ticking removes it, re-ticking restores it if it is still among that day's first 3.
- **Storage (F-1, section 17):** AsyncStorage, one item per year: `reflections:v2:<uid>:<yyyy>` = `{version: 1, days: {date: {habitId: {feel, amount, helped, blocker, text?, savedAt}}}}` holding that year's days, plus the marker `reflections:migrated:v2:<uid>` = `{version: 1, years: [2026, …], v1Length}`. The record from before F-1, `reflections:v1:<uid>` (every year in one item), is read but never written or deleted; its entries are copied into the year items. On this phone only; never synced, never in Firestore or the admin screens. Kept on sign-out like the packs record. Kept when the habit is un-ticked or deleted (its XP follows the completion rule: deleted habits keep their XP). A corrupt year reads as none for that year and is replaced by the next save into it; unreadable storage is never written over, and a failed read never lowers XP or level. Fields this build doesn't know (on a year item or an entry), and days or entries it can't read, are kept by the next save exactly as stored; an unreadable entry counts as "already reflected" (no bar, never written over) and never earns XP (P-8, section 17). Size (measured, UTF-8): saves are about 3 a day through the bar, which offers only while XP is still open, so about 0.85 KB a day with 200-character text and about 0.31 MB a year item; Android reads at most about 2 MB per item and allows 6 MB in all by default. Accepted limitation (2026-11-13): un-ticking and re-ticking to reflect about 20 times a day with text reaches about 2.4 MB a year item (past the per-item limit) and, with v1 kept, past 6 MB in two years; pinned by a test, no save guard.
- **AI rule (applies from stage 9; nothing is sent in Stage 3):** tags are always usable by the AI analysis (counts only). Free text reaches Gemini only when the user turns on "Use my notes in AI summaries" in Settings (off by default; the switch arrives in stage 9), with consent wording that says the text is processed outside Kenya. Only recent short excerpts are sent: at most the last 7 reflections, at most 200 characters each. Reflections on replace habits (from Q10: phone and social, pornography, smoking or vaping, gaming, junk food, alcohol, procrastination, matched by name since Q10 is never stored) never leave the phone, whatever the switch says. Habit names are never sent. Stage 9 adds exactly one audited export path for this.
- **Backlog:** reflections must be covered by in-app data deletion before the Play release.

## 13. Vitality

Built in Stage 4.

- A bar on the Home stats card, named Vitality (Health is a radar axis).
- **Computed from history on every stats load, never stored** (no key, no table, no sync, no network). It is computed inside the existing stats load (services/gamificationStats.ts) from the rows that load already reads: no extra SQLite query and no storage read. Maths in utils/vitality.ts over the shared per-day counts in utils/dailyCompletion.ts (which the radar, section 11, reuses).
- **Per closed day** with at least one scheduled habit: delta = round(10 x done / scheduled) - 4 (halves round up; computed in whole numbers), so +6 for a full day, +1 for half, 0 at 40%, -4 for none; with 8 habits: 8 done +6, 6 done +4, 4 done +1, 3 done 0, 2 done -1, 0 done -4. Clamped to 0..100 after every day. A day with nothing scheduled changes nothing. Days the app wasn't opened have no ticks, so they count as 0 done.
- **Start:** before any day with a scheduled habit has closed, the card shows "Starts after your first full day." with an empty bar, or "Restarts after your first full day." when the account already has completion history (V-2, section 17). After the first such day the value is 50 + that day's delta.
- **Today** is never part of the closed history. The shown value is the value after the last closed day plus today's provisional delta only if it is a gain (capped at 100); a loss applies when the day closes. Home already reloads its stats at local midnight, so yesterday's loss appears then.
- **Who counts on a day (the perfect-day rule):** habits not deleted, created on or before that date (the creation day counts), daily or due on that weekday; done = those with a completed row that date. Completion rows after today are ignored. Days are stepped by calendar day numbers, so daylight saving and clock changes can't add or skip a day.
  - Deleted habits drop out of every day, past ones included, exactly as for perfect days. So a perfect day is always +6 and a day that breaks the streak is always -4. **Known disagreement with the streak:** the streak still counts a past day on which only a now-deleted habit was ticked; Vitality scores that day as 0 done among the remaining habits. Deleting every habit returns the bar to its starting state, with the "Restarts" message (V-2), since the account has history.
  - **Known limitation (shared with XP and streaks):** the current schedule is applied to past days, so changing a habit's frequency can change past Vitality. Fixing it would need a schedule history. Pinned by a test so a change is deliberate (V-1, section 17).
- No game over. A low bar shows "Low. Today is a fresh start."
- **Strings (approved):** label "Vitality"; value "{n} / 100"; low (under 25) "Low. Today is a fresh start."; steady (25 to 74) "Steady. Keep the days ticking."; strong (75 and over) "Strong. You're on a roll."; before the first closed day "Starts after your first full day.", or "Restarts after your first full day." with completion history (V-2); accessibility "Vitality {n} out of 100", and before the first closed day the whole line is one element labelled "Vitality. {that message}".
- **Layout:** below the stats card's existing row, inside the card: one text line ("Vitality" and "{n} / 100" on the left, the message on the right, strictly one line, ellipsized) and a full-width 6 dp bar under it. The same height in every state (one shared line height), about 26 dp. The fill is green, amber below 25 (orange is the XP bar's); contrast against the track: green 5.43:1, amber 8.46:1. It animates with scaleX from the left (transform only) and jumps under reduce motion. Not tappable.

## 14. Checkup (merged into the weekly report)

- The weekly report ends with "Start checkup": at most 5 tap-to-answer questions.
- Questions and recommendations come from local rules over reflection tags, missed days and streaks: shrink a habit, move its time, or add one from a pack. Gemini only writes the narrative, in stage 9, with the template fallback.
- **First checkup:** a Home card (never a pop-up), shown the first time the user completes all of a day's habits, or 24 hours after sign-up, whichever comes first. It works from the chosen packs and habits, since the onboarding answers are not stored.
- **Settings:** Checkup Off / Daily / Weekly (default Weekly), with time and weekday. Weekly checkups are announced inside the weekly report notification (no extra notification). Daily is one question as a Home card, with its own optional local notification.
- **Storage:** answers stored locally as `checkups:v1:<uid>`, never synced.

## 15. Names (shipped in Stage 0c)

- First and last name are asked at sign-up and editable in Settings > Your name; stored on the user's own users document, as Auth displayName and as a copy on the device; used only for the Home greeting (docs/HABITQUEST_DESIGN.md).
- **Backlog:** add "Name" to the privacy policy and to the Play Data safety form.

## 16. Reflection prompt and XP rebalance (locked 5 Nov 2026)

- Ticking a habit shows a non-blocking bar at the bottom of Home, above the tab bar, offering a short reflection on that habit. It never covers the list (it is docked below the list, which shrinks to make room), never needs dismissing, disappears by itself after 8 seconds (20 with a screen reader on), is replaced by the next tick's bar, and is removed if the habit is un-ticked, at midnight and when Home loses focus. It is announced to screen readers, fades instead of sliding under reduce motion, and appears only while that reflection would still earn XP today.
- **Strings (approved in the Stage 3 plan):** bar "{habitName} done. Reflect on it?", reward "+20 XP", button "Reflect" (the whole bar is the button; label "Reflect on {habitName} for 20 XP", hint "Opens a short reflection"; announcement "{habitName} done. Reflect on it for 20 XP from the button at the bottom of the screen."). Screen: see section 12; reward line "+20 XP for answering the four questions." or "This one won't earn XP today."; disabled-save hint "Answer the four questions to save."; discard "Discard this reflection?" / "Your answers won't be saved." with "Discard" and "Keep editing"; errors "Couldn't save reflection" / "Something went wrong. Please try again." and "Already reflected" / "You've already reflected on this habit today.". Home toast after saving: "Reflection saved. +20 XP." or "Saved. +20 XP for reflecting." (rotating); "Reflection saved." when it earned nothing.
- Reflection = up to 4 questions, mostly tap-to-answer closed questions plus one optional free-text question. The reward is earned by answering the closed questions; the free text is optional and never affects XP, so nobody is paid for filler.
- XP: 2 per tick, +5 perfect day, 20 per reflection. At most 3 rewarded reflections per day, and only one per habit per day. Level n to n+1 costs 100n XP, so level L is reached at 50 x L x (L - 1): level 2 at 100, 3 at 300, 4 at 600, 5 at 1000, 10 at 4500. XP stays derived from habits/completions/reflections, never stored as a running total; un-ticking a habit removes its tick XP and that day's reflection XP for it. Existing accounts are recalculated from history, so levels will drop; this is expected.
- Streak milestone XP is kept but scaled by the same factor as ticks (divided by 5, rounded):

| Streak days | 3 | 7 | 14 | 30 | 60 | 100 |
|---|---|---|---|---|---|---|
| XP (was) | 5 (25) | 10 (50) | 20 (100) | 40 (200) | 80 (400) | 160 (800) |

- **Level drops and celebrations:** a drop never shows anything (no "level down", no overlay, no toast). Level celebrations use the keys `level:v2:N` from Stage 3; the old curve's `level:N` keys are ignored and never deleted (so a level reached again on the new curve gets its full celebration, and going back to an older update can't celebrate twice). Streak keys are unchanged. A level reached by a reflection is celebrated on Home's next focus after the save. "Near level" toasts start at 20 XP to go (one reflection).
- XP and level are read only on the phone (Home stats card and limits, Profile, the celebrations, services/packLimits.ts) through services/gamificationStats.ts. They are not stored, synced, sent to the insight function or shown in the admin screens, so the recalculation touches nothing outside the phone. A stats load whose reflections can't be read fails as a whole (F-1, section 17): the screens keep the last numbers they showed, so a failed read never shows a lower level.
- Over-limit rule (applies from Stage 2): habit and pack limits only ever block ADDING. Nothing is deleted, hidden or disabled when a level drop puts an account over its limit.
- Ticks are self-reported; reflections add context but do not prove completion. The final report must state this as a limitation.

## 17. Decisions from the test-strategy audit (2026-11-09)

Rules decided after the spec red-team in docs/TEST_STRATEGY.md (Part B). Each has an "Odd states" line: what happens
for an account that is not in a "normal" state, and the test that checks it. Fixes land in Phase 1b unless marked
"pinned" (today's behaviour, kept on purpose).

- **S-4, template-creating actions wait for the first pull.** "Add the rest", a Settings retake (ONBOARDING_SPEC
  section 5) and, later, a report's "Add" suggestion create nothing until this uid's first pull from Firestore has
  finished on this phone. Picking packs (which only adopts) is not blocked.
  - Odd states: a new phone, a reinstall, or a sign-in while offline: the other phones' habits are not here yet, so
    name matching can't see them and the templates would be created twice. Once the first pull has finished, later
    offline use is not blocked. A different uid on the same phone waits for its own first pull. Tests: S4-1 to S4-5
    (docs/TEST_STRATEGY.md, Phase 1b).
- **P-2, a renamed template habit leaves its built-in pack's templates.** Renaming the only habit in a built-in pack
  that carries a template's name adds that template to the pack's `dropped`, so "Add the rest" doesn't create it
  again; renaming it back to the template's name takes it out of `dropped` (the existing "putting it back" rule).
  - Odd states: two members with the template's name (renaming one changes nothing); a rename that only changes case
    or spacing (still the template); an unpacked habit or one in a custom pack (no pack changes). Tests: P2-1 to P2-5.
- **P-8, older code never drops newer fields (built in Phase 1b, 2026-11-13).** Every record's parser accepts and
  ignores fields it doesn't know, and a save keeps them, so an OTA rollback or a launch from the embedded bundle can
  re-save a record without losing what a newer update added.
  - How (utils/unknownFields.ts): an object record's parser keeps the keys it doesn't know, as stored, in
    `unknownFields`; a map record (the area map, a reflection day) keeps the entries it can't read. Only the parser
    creates them (a test scans the app for any other file that does); the serialiser writes them first and then the
    known fields one by one, so a known field always wins and nothing else held in memory is written. A known key
    whose value this build can't read is dropped as before, never carried.
  - Records: the packs record (record and each pack) and the mirror's copy of it (the mirror's own top-level keys are
    not carried: it is a cache, rebuilt on every write); the area map (section 11); the reflections record (section
    12: unreadable entries count as "already reflected" and never earn XP; the parser and serialiser work on any set
    of days, so F-1's one item per year reuses them unchanged; F-1's marker is a P-8 record too); the notification settings (kept apart from the
    settings in effect, written back by the next change). Already compliant, pinned by tests: the celebrated keys (every
    key is kept; only `perfect:`/`early:` keys older than 7 days go) and the celebrations switch (a scalar written
    only when the user flips it).
  - Exceptions: the onboarding record keeps its privacy whitelist (only the known fields are ever written, so answers
    and Q10 can never reach storage). The starting outline is replace-only (section 11): a retake replaces it from
    fresh scores and carries none of its keys, since they would describe the outline being replaced.
  - Rules for newer builds (decided 2026-11-13): a newer build never changes an existing field's type or widens its
    allowed values; it adds a new field instead, which older builds carry untouched. These records stay at
    `version: 1`; a breaking change uses a new key (as F-1 does), because an older build reads another version as
    corrupt, and some paths replace a corrupt record (picking packs, saving a reflection).
  - Odd states: a record written by a newer update and re-saved by an older one; a newer field next to a value the
    older build changed (the newer build must re-check its own fields on read, never assume they match); a stored
    `__proto__` key (kept as a plain key, never a prototype). Size: nothing is added for today's records; parsing
    scans each object's keys once (the reflections record is the largest, about 6,000 entries after a year at 16
    habits); a carried field can't be pruned by an older build. Tests: tests/decided-rules.test.ts (P-8: one rollback
    test per record, the negative tests and the source scan).
- **F-1, reflections split per year; a failed read never lowers XP or level (built in Phase 1b, 2026-11-13).** The
  reflections record is stored in one item per year, `reflections:v2:<uid>:<yyyy>`, through the P-8 parser and
  serialiser unchanged, with the marker `reflections:migrated:v2:<uid>` = `{version: 1, years, v1Length}`
  (services/reflectionsStoreCore.ts; the year helpers in utils/reflections/record.ts).
  - Migration: the first load of an app run reads the marker and `reflections:v1:<uid>` in parallel (separate calls,
    since one row too big fails a whole multiGet on Android), then every year the marker lists in one multiGet
    (lifetime XP needs every year). v1 is merged into the years when there is no marker yet, when v1's length differs
    from the marker's (an older build saved to v1 during a rollback: an OTA rollback, or a launch from the embedded
    bundle), or when a listed year is missing or corrupt; a habit and day a year already has keeps the year's entry.
    The changed years and the marker go in one multiSet, so the marker never lands without them (Android: one SQLite
    transaction; iOS: the marker sits in the manifest, written after the year files). A kill before or during it
    leaves no marker, and the next run merges again by union (nothing duplicated, nothing lost). With no marker, the
    years come from this uid's keys (`getAllKeys`); a new account gets a marker at once. A failed migration write
    never fails the read: the merged record is served and the writes are retried by the next load or carried by the
    next save. v1 is never written or deleted in this change; v1's own unknown keys and non-date keys stay there.
  - Failed reads: a marker or year that can't be read makes the read reject (not remembered, so the next read tries
    again). v1 that can't be read rejects only before migration; once a valid marker exists it is skipped and logged,
    and the years are served (nothing is rewritten without v1 to repair from). The rejection fails the stats load
    (services/gamificationStats.ts), which publishes nothing (services/statsStore.ts), so the shared entry keeps the
    last numbers. Home keeps the last numbers it showed for this user; with none shown yet, the card's placeholder
    stays (one rule for every stats failure; it used to collapse). Profile keeps its entry or its "couldn't be loaded"
    line. No reflection bar is offered; a save returns "failed". Limit checks use the last known level, or with none
    the level from ticks alone (a lower bound); a refusal at that level never names one: "Couldn't check your level
    just now. Try again in a moment." (approved 2026-11-13).
  - Rollback window (accepted): while an older build runs, it sees only v1, so reflections saved by F-1 are missing
    there (lower XP on that build; a level drop shows nothing). A reflection it saves for a habit and day a year
    already has is not merged (the year's entry wins; it stays in v1).
  - Later step (not built): delete `reflections:v1:<uid>` after the next store build, once no rollback target or
    embedded bundle predates F-1. Until then both copies are kept (section 12, size).
  - Odd states: a record past Android's per-item read limit (v1 before migration rejects; see section 12 for the
    accepted 20-a-day case), unreadable storage, a corrupt year (reads as none for that year; refilled from v1 for
    entries from before migration, else replaced by the next save), a date from a wrong clock (its own year key),
    a kill mid-migration, two uids sharing a key prefix (`u1`, `u10`: never read). Tests: tests/decided-rules.test.ts
    (F-1), tests/reflections-years.test.ts (migration, kill mid-migration, rollback window, failed reads, year
    boundary, sizes, P-8, fixtures large and everythingCorrupt), tests/reflections-store.test.ts.
- **V-1, the current schedule applies to past days (pinned).** Unchanged accepted limitation (section 13).
  - Odd states: a daily habit changed to one weekday loses its past perfect days and streak days on the other
    weekdays; its tick XP stays. Test: tests/decided-rules.test.ts (V-1).
- **V-2, "Restarts after your first full day."** When Vitality is starting and the account has completion history
  (any completed row dated before today, deleted habits included), the card says "Restarts after your first full
  day." instead of "Starts after your first full day."; the accessibility label uses the same text. The string goes
  through the usual copy approval.
  - Odd states: every habit deleted and recreated (fixture recreated); only un-ticked or future-dated rows (not
    history). Tests: V2-1 to V2-4.
- **R-1, area entries of deleted habits are pruned (built in Phase 1b, 2026-11-13).** The next write to
  `areas:v1:<uid>` (the habit form's area save, the only writer) removes the entries of habits known to be deleted:
  the ids SQLite has with `deleted = 1` for this uid (db/habitsCore.js `getDeletedHabitIds`), both readable entries
  and the unreadable ones kept by P-8. Deletes are sticky, so a pruned entry is never needed again. Entries of habits
  moved into a pack are kept (used again if the habit leaves the pack). There is no prune when a habit is deleted
  (decided 2026-11-13); each entry is about 60 bytes.
  - A habit that isn't on this phone at all is never treated as deleted, and a failed or partial read of the deleted
    ids prunes nothing (the area is still saved).
  - Odd states: a large account with many deleted habits (fixture large: one write prunes 150); unreadable storage
    (never written over, so nothing is pruned; the save resolves false); a read (never writes); a corrupt map (still
    replaced); a habit not on this phone; another uid's map. Tests: R1-1 to R1-5 (tests/r1-storage.test.ts).
- **R-1, storage that couldn't be read is never written over (built in Phase 1b, 2026-11-13).** "Couldn't be read"
  means the storage call itself failed; a corrupt value (readable, but not the record's shape) is still replaced
  as each record's rules say. Store by store:
  - Area map: the save resolves false, silently (above).
  - Packs record: `update()` doesn't call the change and resolves `'unreadable'`; its result is a typed union that
    every caller handles through `onPacksUpdate` (one handler per result, all required). The picker, the pack edit
    screen and pack delete show their existing alerts and stay open (section 2); the habit form's pack move and
    onboarding's pack join skip silently.
  - Onboarding record: `write()` skips silently until a read of the record succeeds. A Settings retake still creates
    its habits; name dedupe still applies on the next retake (decided 2026-11-13).
  - Celebrated keys: marks stay in memory (nothing repeats in this app run); a later mark reads again, merges what is
    stored, and only then saves.
  - Insight cache: a failed read is not remembered; a write reads again first and, if it still can't, the entry is
    kept in memory only.
  - Sync cursors (`sync:<uid>`): a failed read ends that sync cycle before any network call (no probe, pull, push or
    cursor write) and leaves `initialPullDone` as the status had it; the cursors are never reset automatically. The
    engine counts such cycles in a row (`cursorReadFailures`, memory only, 0 after a read that works and on sign-out,
    sign-in and restart). From 3, Settings shows, muted, under its title (with the S-1 clock line if both apply):
    "Backup paused: this phone couldn't read its backup progress. It will keep trying." (approved 2026-11-13), and
    the sync log records it once. It goes after the next cursor read that works.
  - Startup trace (trace builds only): the save is skipped.
  - Already compliant, pinned by tests: reflections (F-1) and the notification settings.
  - Exempt (confirmed 2026-11-13), each written without reading it first, with nothing it could lose: the packs
    mirror (a cache of the packs record, rebuilt from it on every write), the profile name copy (a copy of the users
    document, refreshed from it), the sign-in marker (a copy of the uid Firebase Auth confirmed), the celebrations
    switch (written only with the value the user just chose), the packs "Not now" flag (its only value is "1"), the
    onboarding pending flag (set at sign-up and cleared exactly when the record is written) and the starting outline
    (replace-only, section 11).
  - Tests: tests/r1-storage.test.ts (each store's unreadable case, the packs alerts and the onPacksUpdate scan, the
    retake, the sync stop and the 3-cycle line), tests/sync-status-line.test.ts, tests/cursor-store.test.ts.
