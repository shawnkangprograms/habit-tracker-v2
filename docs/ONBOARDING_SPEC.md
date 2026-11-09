# HabitQuest onboarding: locked design spec (v1)

Status: LOCKED 2026-11-02. Source of truth for look and feel: the user's Figma file (frames "Onboarding Q1..Q10", "Building Profile", "Habit Profile", "Recommended Routine"). This spec changes the content of those frames as described below. Reference-app screenshots were used for ideas only; copy and art are our own.

## 1. Shape of the flow

Shown once, after a sign-up on this phone (a local pending flag per uid, set by the sign-up success path and cleared when the record is written; existing accounts and later sign-ins never see it on their own). A "Skip setup" link sits top-right on every step. Skipping goes straight to Home with no starter habits. Retake lives in Settings and only ADDS habits (never deletes or edits existing ones).

11 steps, a fixed count. Progress reads "STEP n OF 11". Step 10 is optional and skippable; every other step needs an answer to continue.

First-step notice (small text under the title, step 1 only): "Your answers stay on this phone. Skip anything you like."

| #   | Question                                                                             | Type                       | Enum values                                                                                              |
| --- | ------------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | How much time can you give to habits on a normal day?                                | single                     | min5, min15, min30, min60                                                                                |
| 2   | What best describes you right now?                                                   | single                     | student, early_career, mid_career, self_employed, between_jobs                                           |
| 3   | How do your habits feel right now?                                                   | single                     | thriving, alright, struggling, overwhelmed                                                               |
| 4   | What needs the most attention right now? (Pick up to 3.)                             | multi, 1-3                 | health, mental, career, discipline, relationships, education                                             |
| 5   | What's your biggest challenge?                                                       | single, list depends on Q2 | see below                                                                                                |
| 6   | What usually derails your routine?                                                   | single                     | stress, boredom, low_motivation, environment, social_pressure                                            |
| 7   | How's your sleep right now?                                                          | single                     | good, okay, struggle, irregular                                                                          |
| 8   | How do your days usually look?                                                       | single                     | predictable, mostly, weekly_change, chaotic                                                              |
| 9   | What matters most to you? (Pick up to 2.)                                            | multi, 1-2                 | health_energy, peace_of_mind, achievement, freedom, connection                                           |
| 10  | What bad habit hurts you the most? (Optional)                                        | single, skippable          | phone_social, porn, smoking_vaping, gaming, junk_food, alcohol, procrastination, other, (null = skipped) |
| 11  | Can you stick with a daily routine for 7 days? "Be honest, there's no wrong answer." | slider 1-10, default 5     | integer                                                                                                  |

Exact option labels are the ones in Figma, except:

- Q2 labels: "Student", "Early in my career", "Mid-career", "Self-employed or building something", "Between jobs".
- Q10 labels: "Phone & social media", "Pornography", "Smoking or vaping", "Gaming", "Junk food", "Alcohol", "Procrastination", "Something else, I'll add it myself", plus a "Skip this one" text button.

### Q5 lists (branch the content, not the structure)

- If Q2 = student, values: study_focus "Can't focus when studying", procrastination "Procrastination", overwhelmed "Feeling overwhelmed", memory "Poor memory retention", study_motivation "No motivation to study".
- Otherwise (the Figma list), values: time "Time management", focus "Focus & distraction", procrastination "Procrastination", low_energy "Low energy throughout the day", balance "Work-life balance".

Changing Q2 after answering Q5 clears Q5 (the list changed).

## 2. Data handling (hard rules)

- The answers are held in memory only and are not stored anywhere. The local record (AsyncStorage key `onboarding:v1:<uid>`) is JSON with a `version`, `skipped`, `answers` (always written as null), `completedAt`, and `addedTemplateIds` (catalog ids only, for retake dedupe). Records saved before this rule may still carry answers: the parser accepts and ignores them, so there is no migration and those records keep their `addedTemplateIds`.
- The sign-up pending flag (`onboarding:pending:v1:<uid>`) is local too: set by the sign-up success path, cleared when the record is written (finish or skip).
- Follow whatever the app already does with other per-uid local data on sign-out (for example the insight cache) and apply the same to this record. Report what that behaviour is.
- Never written to Firestore, never added to the sync payload, never sent to the Gemini function. Onboarding modules must not import firebase/firestore or firebase/functions (extend the existing ESLint no-restricted-imports rule to cover the onboarding folder).
- Q10 is sensitive. It is held in memory only long enough to build the plan and is NEVER persisted: not in the local record, not on any habit row, not in any id. Replace habits for the sensitive answers (porn, smoking_vaping, alcohol) use neutral names, so a synced habit never reveals them. Replace habits are deduped on retake by comparing names with the user's existing habits, not by a stored id.
- No free-text input anywhere in onboarding. "Something else" just shows an "Add your own habit" button on the routine screen.
- The "1M+ members" badge in Figma is NOT built. Remove it or replace it with a true line.
- Age gate: handled on the sign-up form (validated 18-99 before the account is created). Onboarding does not ask age, and age does not affect scoring.

## 3. Scoring (pure function, unit-tested)

Six axes, as in Figma: Learning, Mind, Career, Discipline, Relations, Health. Each starts at 1 and adds points below. Cap at 5.

- Health: +2 if focus has health; +1 if values has health_energy; +1 if sleep is struggle or irregular; +1 if challenge is low_energy.
- Mind: +2 if focus has mental; +1 if values has peace_of_mind; +1 if habitsFeel is overwhelmed; +1 if derails is stress.
- Discipline: +2 if focus has discipline; +1 if challenge is procrastination; +1 if derails is low_motivation; +1 if habitsFeel is struggling or overwhelmed; +1 if days is chaotic.
- Career: +2 if focus has career; +1 if values has achievement; +1 if occupation is not student; +1 if challenge is time or balance.
- Learning: +2 if focus has education; +1 if occupation is student; +1 if challenge is one of study_focus, overwhelmed, memory, study_motivation (the values that exist only in the student list; procrastination does not count).
- Relations: +2 if focus has relationships; +1 if values has connection; +1 if derails is social_pressure.

Focus axis = highest score. Ties break by the order the user picked their focus areas in Q4, then by this fixed order: Discipline, Health, Mind, Career, Learning, Relations.

The radar plots score/5. The inner dashed polygon is a fixed baseline of 2/5. (Later, the Summary tab may show the same radar from real 30-day completions. Not in this scope.)

## 4. Starter habits (local rules, no AI)

How many: confidence 1-3 gives 2 habits, 4-7 gives 3, 8-10 gives 4. Add 1 more if Q10 was answered (the "replace" habit below), up to a maximum of 5.

Pick order (since Stage 1a, docs/PACKS_REPORTS_SPEC.md sections 1 and 3): two built-in packs are chosen from the scores (the focus axis's pack, then the highest remaining score, ties in the order Health, Mind, Discipline, Career, Learning, Relations), and their templates are taken in turn: the focus pack's first, the second pack's first, the focus pack's second, and so on, in card order. Only when every template left in both packs is already picked (a retake) does the rest of the catalog fill in, by area rank. If sleep is struggle or irregular, force one sleep template (from Calm Mind, even when that pack was not chosen). Never pick two templates with the same id. Every template carries a fixed one-line reason of at most 60 characters shown on its card. Before Stage 1a the pool was the first 14 templates, one per top axis, then the focus axis.

Time budget (Q1): every template has a `minutes` value (habits that take no real time are 1). No single catalog pick may be longer than the budget's single cap, and the catalog picks together may not exceed its total cap (twice the budget). A template that does not fit is skipped and picking continues down the same order, so a small budget can give fewer picks than the count. The Q10 replace pick is exempt from both caps. The forced sleep pick (1 minute) takes a free slot if it fits, otherwise the last one.

Catalog (ids stable; names are final unless a limit forces a rewrite). Axis is the onboarding axis each template was first given; Area is its pack's area (docs/PACKS_REPORTS_SPEC.md, section 1), which packs, the fill-in rank and the later radar use. The last 10 rows arrived in Stage 1a.

| id                 | Axis       | Area       | Name                           | Minutes |
| ------------------ | ---------- | ---------- | ------------------------------ | ------- |
| walk20             | Health     | Health     | Walk for 20 minutes            | 20      |
| stretch10          | Health     | Health     | Stretch for 10 minutes         | 10      |
| water_meals        | Health     | Health     | Drink water with each meal     | 1       |
| lights_out         | Health     | Mind       | Lights out at a set time       | 1       |
| screens_off        | Health     | Mind       | No screens 30 min before bed   | 1       |
| breathe5           | Mind       | Mind       | Breathe for 5 minutes          | 5       |
| journal3           | Mind       | Mind       | Write 3 lines in a journal     | 5       |
| plan_top1          | Discipline | Discipline | Plan tomorrow's top task       | 5       |
| focus25            | Discipline | Career     | One 25-minute focus block      | 25      |
| study25            | Learning   | Learning   | Study for 25 minutes           | 25      |
| review10           | Learning   | Learning   | Review notes for 10 minutes    | 10      |
| skill15            | Career     | Career     | Practise a skill 15 minutes    | 15      |
| message_friend     | Relations  | Relations  | Message someone you care about | 5       |
| family_time        | Relations  | Relations  | Family meal or call            | 30      |
| eat_produce        | Health     | Health     | Eat one fruit or vegetable     | 1       |
| make_bed           | Discipline | Discipline | Make your bed                  | 2       |
| tidy5              | Discipline | Discipline | Tidy your space for 5 minutes  | 5       |
| set_out_essentials | Discipline | Discipline | Set out tomorrow's essentials  | 5       |
| work_win           | Career     | Career     | Track one work win             | 2       |
| reach_out          | Career     | Career     | Reach out to one contact       | 5       |
| read15             | Learning   | Learning   | Read for 15 minutes            | 15      |
| teach_back         | Learning   | Learning   | Teach what you learned         | 5       |
| thank_someone      | Relations  | Relations  | Thank someone today            | 1       |
| kind_act           | Relations  | Relations  | Do one kind thing              | 5       |

| Budget | Single cap | Total cap |
| ------ | ---------- | --------- |
| min5   | 5          | 10        |
| min15  | 15         | 30        |
| min30  | 30         | 60        |
| min60  | no cap     | no cap    |

Replace habit minutes: phone_social 1, porn 1, smoking_vaping 5, gaming 1, junk_food 30, alcohol 1, procrastination 5

Habit names must be 30 characters or fewer (validateHabitName). The copy-table test enforces this for every catalog and replace name.

"Replace" habits from Q10. Rule: the three sensitive answers (porn, smoking_vaping, alcohol) get neutral names that do not reveal the answer once synced. The ordinary answers keep descriptive names.
phone_social: "Phone-free first hour". porn: "Phone out of the bedroom". smoking_vaping: "Fresh-air morning". gaming: "Gaming stops at a set time". junk_food: "Cook one real meal". alcohol: "Clear-headed evening". procrastination: "Start with just 5 minutes". other or skipped: none.

Icons: use the existing icon set; if a category has no fitting icon yet, fall back to a neutral one and log it as a known gap.

## 5. Screens after Q11

1. Building Profile: ring counts 0 to 100% over about 2.5 s; four checklist rows tick in one after another; a rotating quote below. The real work is instant, so keep the wait short and never fake a longer one. Rows: "Scanning your answers", "Mapping your focus areas", "Detecting your habit type", "Preparing your plan".
2. What you told us: three cards, each a short sentence reflecting one answer (challenge, days, derails). A copy table with one line per enum value is delivered separately.
3. Habit Profile (Figma): radar plus "Your plan will focus on <focus axis>" card.
4. Recommended Routine (Figma): the picked habits as toggleable cards, each with its reason line. A reminder-time picker (default 8:00 pm) sits at the bottom, wired to the existing reminder setup. Buttons: "Add your own habit" and "Start". Toggled-off cards are not created.

Retake (Settings): runs the same flow, then shows only templates not in `addedTemplateIds` and not already an active habit with that name (compared ignoring case and extra spaces).

- **Odd states (2026-11-09, S-4):** on a phone where this uid's first pull from Firestore has not finished (a new phone, a reinstall, offline since sign-in), the habits from other phones are not here yet, so name dedupe can't see them: a retake creates no habits until that first pull has finished (docs/PACKS_REPORTS_SPEC.md, section 17). A habit renamed by the user is no longer the template and is offered again (by design). A run killed after its first habit is not reopened; a retake offers the rest.

## 6. Animations

Principles: transforms and opacity only, run on the UI thread, nothing during cold start, honour the system reduced-motion setting (replace with plain fades), no animation inside long lists, and check cost in the startup trace.

Onboarding:

- Options press down like a physical button (about 3 px) and spring to the selected state; light haptic only if the haptics module is already in the installed build.
- Progress bar fills smoothly with a glowing head, and animates on every step change.
- Steps slide and fade (about 200 ms). Back reverses the direction.
- Confidence number bumps on every change.
- Building Profile ring and checklist as in section 5.
- Radar draws out from the centre, then labels fade in.
- Routine cards stagger in; toggling a card pops its check.

In app:

- Completing a habit: check burst, floating "+XP", XP ring fill, streak flame flicker.
- Level-Up overlay polish.
- Tab and screen transitions: short fade or slide.

## 7. Constraints for Claude Code's plan

- Ships as an OTA to runtime d820d501: NO native dependencies added, NO app.json or eas.json changes, NO versionCode change. Check which of react-native-reanimated, react-native-svg and expo-haptics are already in the installed build; if one is missing, drop that feature rather than add it.
- No new SQLite schema (stay on v2). Habits are created through the existing add-habit path.
- Pure logic (scoring, picking, branch rules, validation, parse/serialise) lives in utils/ with unit tests; no Firebase imports in it.
- Tests must cover: every enum validated; Q2 change clears Q5; scoring table cases; ties; habit count by confidence; sleep force-pick; Q10 replace habit added with its generic name; retake dedupe; skip paths; answers never reach sync or the insight input.
- Plan first, in stages: (1) pure logic and tests, (2) flow screens, (3) post-Q11 screens and habit creation, (4) animations. Commit between stages.

## 8. Titles and option labels (exact text from Figma)

Style: dark screen, small orange "STEP n OF 11" top right, "Back" top left (not on step 1), thin orange progress bar, large white question title, optional grey hint line, option rows as dark rounded cards with a radio (single) or checkbox (multi), selected row has an orange outline and tint, big orange "Continue" button with a soft glow. Build from our existing theme tokens. The thin illustrated banner strip under the progress bar in Figma is NOT built (we have no asset).

| Step        | Title                                          | Hint                                | Option labels, in order                                                                                                                                                           |
| ----------- | ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1           | How much time can you give to habits on a normal day? | We'll keep your plan small enough to stick. | About 5 minutes / 10 to 15 minutes / 20 to 30 minutes / An hour or more                                                                                                   |
| 2           | What best describes you right now?             |                                     | Student / Early in my career / Mid-career / Self-employed or building something / Between jobs                                                                                    |
| 3           | How do your habits feel right now?             |                                     | On track and thriving / Doing alright, not great / Struggling to keep up / Overwhelmed and need help                                                                              |
| 4           | What needs the most attention right now?       | Pick up to 3.                       | Health & fitness / Mental wellbeing / Career & productivity / Discipline & habits / Relationships & social life / Education & learning                                            |
| 5 (student) | What's your biggest learning challenge?        |                                     | Can't focus when studying / Procrastination / Feeling overwhelmed / Poor memory retention / No motivation to study                                                                |
| 5 (others)  | What's your biggest challenge?                 |                                     | Time management / Focus & distraction / Procrastination / Low energy throughout the day / Work-life balance                                                                       |
| 6           | What usually derails your routine?             |                                     | Stress / Boredom / Low motivation / Bad environment / Social pressure                                                                                                             |
| 7           | How's your sleep right now?                    |                                     | I sleep well and wake up refreshed / It's okay, could be better / I struggle with sleep regularly / My schedule is all over the place                                             |
| 8           | How do your days usually look?                 |                                     | Very predictable, same routine daily / Mostly predictable, some surprises / Changes week to week / Very chaotic right now                                                         |
| 9           | What matters most to you?                      | Pick up to 2.                       | Health & energy / Peace of mind / Achievement & success / Freedom & independence / Connection & belonging                                                                         |
| 10          | What bad habit hurts you the most?             | Optional.                           | Phone & social media / Pornography / Smoking or vaping / Gaming / Junk food / Alcohol / Procrastination / Something else, I'll add it myself (plus a "Skip this one" text button) |
| 11          | Can you stick with a daily routine for 7 days? | Be honest, there's no wrong answer. | Slider 1-10, default 5, end labels "Not confident" and "Very confident", large orange number above the slider                                                                     |

Option labels map to enum values in the order of the enum lists in section 1 (Q5 student list: study_focus, procrastination, overwhelmed, memory, study_motivation; Q10: phone_social, porn, smoking_vaping, gaming, junk_food, alcohol, procrastination, other).

## 9. Decisions from the plan review (2026-11-02)

- Catalog names shortened to fit the 30-character limit (see section 4).
- Replace-habit names: neutral for the three sensitive answers, descriptive for the rest (section 4).
- Q10 is never persisted (section 2).
- Learning scoring uses only the student-only challenge values (section 3).
- Q2 change clears Q5 only when the list changes (student vs not).
- Android hardware Back on step 1 does nothing (it does NOT skip). Skipping is only the explicit "Skip setup" link.
- Q4: a 4th pick does nothing and unselected options dim. Q9: same with 2.
- The Q11 slider is custom (gesture-handler + reanimated); give it an accessible adjustable role with increment and decrement actions.
- Offline first sign-up: onboarding waits for the restore signal (Addendum A). Accepted as a known gap.
- Route cost: compare home:usable before and after on the Itel (5 launches each, same method as the insight card). It must not regress beyond noise.
- All other assumptions in the plan are approved.

## 10. Decisions from the Itel session (2026-11-03)

- Q1 asks for the daily time budget instead of age (section 1); the age gate is on the sign-up form. Starter picks respect the budget caps (section 4); the pool stays the 14 templates above.
- The record no longer stores answers (section 2); no migration.
- Auto-show only after a sign-up on this phone (section 1). The offline-first-sign-up rule (wait for the restore signal) and "a relaunch reopens it if killed before the first habit" still hold.
- "Add your own habit" opens the habit form over the routine; Back returns to the routine, a habit made there shows as added with the reason "Your own habit", and the first habit of the run writes the finished record.
- Layout: the radar fills the content width and sizes itself so every label fits; day-1 move labels sit above their titles; routine card names take up to two lines; 28 px titles use a 36 px line height (at least the font's natural 35.7 px).
- Sign-up opens onboarding straight away over a blank Home with the tab bar hidden (an in-memory flag set before the account is created); the Home gate stays as the fallback after a kill mid-setup, and neither opens a second copy. If the sign-up is rolled back (no one signed in), onboarding closes itself.
- "Skip setup" asks first, on every question and result screen: "Skip setup?" (or "Leave setup?" once a habit exists in this run). "Yes" shows "Taking you home..." with "Go home", which moves on by itself after about 2 s; the skip behaviour itself is unchanged. Copy in ONBOARDING_COPY.md section 7.
- Building Profile quotes swap every 1.2 s, and only while a swap can finish before the count reaches 100%: one swap per visit, none as the screen moves on (none under reduced motion).
- The Q11 slider is one pan that starts on touch-down, so drag and tap are the same gesture; a vertical scroll can't start on the slider strip.

## 11. Decisions from Stage 1a (2026-11-04, habit packs)

- The catalog has 24 templates (section 4), each with an area. Starters come from two built-in packs chosen from the scores (section 4; docs/PACKS_REPORTS_SPEC.md, sections 1 and 3); the time caps, count, sleep force and Q10 rules are unchanged. This replaces the "pool stays the 14 templates" line in section 10.
- The Recommended Routine groups its cards under the pack each will join, then "Other habits" (the forced sleep pick from another pack, a retake fill-in, the Q10 replace pick, and habits made with "Add your own habit"). Copy in ONBOARDING_COPY.md section 7.
- Every run writes the pack record (only the two pack ids and their names) right after each onboarding record save; never on Skip. The two packs are created once the run has made a habit and the user has no packs (no record, or an empty one), including a Settings run after a skip. When packs exist, a run only adds starters to packs the user already has. The pack record's failure never blocks onboarding. The first run never checks the habit or pack limits; a Settings retake is checked (docs/PACKS_REPORTS_SPEC.md, section 2b: the selected cards are created while there is room, then the habit limit message shows under Start). (Reworded 2026-11-09, P-4: this line used to say onboarding never checks the limits, which contradicted section 2b and the code.)
