# HabitQuest test strategy for the public release

Written 2026-11-09 after the duplicate-template and limit-message bugs, both of which passed 900+ tests. Both were
assumptions in the spec that only held for a "normal" account, and the tests were written from the same spec. A public
release means real users with years of odd data, many devices, and OTA updates landing on old local data, so the suite
has to test outside the spec's assumptions: odd-state fixtures, invariants, random sequences of real actions, upgrade
paths, and device checks for what Node cannot see.

Phases are approved one at a time. Nothing in this plan changes app.json, eas.json, package.json or package-lock.json
until a package change is approved separately. **The fingerprint hashes `packageJson:scripts`**: no npm script is ever
added for tests; new test files are picked up by the existing `tests/*.test.ts` glob, and longer runs are started with
`node` directly.

## Decisions (approved 2026-11-09)

| Id | Rule | Where it is recorded |
|---|---|---|
| S-1 | Every user write stamps `updatedAt = max(now, row.updatedAt + 1)` (monotonic per row). Rows stuck with a future `updatedAt` are handled (mechanism proposed for Phase 1b). Cross-device clock skew is a documented last-write-wins limit. | HABITQUEST_DESIGN.md |
| S-2 | A habit's `createdDate` is clamped to `min(createdDate, today)`, and only that, wherever it is computed with `today`. | HABITQUEST_DESIGN.md |
| S-4 | Template-creating actions ("Add the rest", a Settings retake, later a report's "Add" suggestion) wait for the first pull of this uid on this phone. | PACKS_REPORTS_SPEC.md §17, ONBOARDING_SPEC.md §5 |
| S-6 | Notification and celebration settings are device settings, shared by every account on the phone. | HABITQUEST_DESIGN.md |
| P-2 | Renaming the only habit in a built-in pack that carries a template's name adds that template to the pack's `dropped`. | PACKS_REPORTS_SPEC.md §17 |
| P-4 | ONBOARDING_SPEC §11 reworded: only the first run never checks limits; a Settings retake is checked. | ONBOARDING_SPEC.md §11 |
| P-8 | Parsers accept and ignore unknown fields; a save keeps fields it does not know. Exception: the onboarding record keeps its privacy whitelist. | HABITQUEST_DESIGN.md |
| F-1 | Reflections are split per year; a failed read never lowers XP or level. | PACKS_REPORTS_SPEC.md §12, §17 |
| V-1 | The current schedule is applied to past days (accepted limitation), pinned by a test. | PACKS_REPORTS_SPEC.md §13, §17 |
| V-2 | When Vitality is starting and the account has completion history, the copy is "Restarts after your first full day." | PACKS_REPORTS_SPEC.md §13, §17 |
| R-1 | Area-map entries of deleted habits are pruned at the next write. | PACKS_REPORTS_SPEC.md §11, §17 |

Open, not decided: S-5 (Firestore read cost of restoring a large account; measure in the emulator first), F-1's
storage layout (key per year; proposed in the 1b plan), and the clock-status copy (proposal in the Phase 1a report).

## Part A: post-mortem of the five bugs

The table, and every phone-found bug from now on, lives in [BUG_LOG.md](BUG_LOG.md). Pattern: three of the five
(duplicate, limit, Vitality) were the spec's own assumptions about a normal account; two needed a phone (flash,
keyboard).

## Part B: spec red-team (rules that only hold for a normal account)

| # | Rule | Odd state | Test of the odd state | Rule now |
|---|---|---|---|---|
| S-1 | Last-write-wins on client `updatedAt` | Clock behind or moved back: the edit is refused or replaced by the next pull. Clock more than a day ahead: nothing pushes. | tests/clock-skew.test.ts (todo until 1b) | Decided |
| S-2 | `createdAt` from the client clock | A habit created with the clock ahead is unscheduled until its future date | tests/decided-rules.test.ts (todo) | Decided |
| S-3 | Completions after today are ignored | A tick made with the clock ahead counts later | gamification, summary, fixture clockAhead | Keep |
| S-4 | Sync at launch, foreground, every 5 min | New phone offline before its first pull: "Add the rest" or a retake re-creates templates that exist on the other phone | 1b | Decided |
| S-5 | One completion doc per ticked day | Restoring a large account reads many docs (Firestore free tier: 50k reads a day for the whole project) | none | Measure (Phase 4) |
| S-6 | Per-user data | Notification and celebration prefs are device-wide | tests/decided-rules.test.ts (pin) | Decided: device settings |
| S-7 | Local date everywhere | Travelling east skips a local date; west repeats one | partial | Keep, document |
| P-1 | One pack per habit | A record listing an id twice | packs-record | Keep |
| P-2 | Template present by name | A renamed pack habit makes "Add the rest" re-create the template | 1b | Decided |
| P-3 | Adoption by name | Two same-named habits; one already packed | packs-membership, mutation-killers (M08) | Keep |
| P-4 | Retake limits | ONBOARDING §11 contradicted PACKS §2b | packs-manage | Reworded |
| P-5 | "Add the rest" level fallback 1 | Too little room (safe), possibly the wrong level named | none | Keep; test that the fallback never allows more |
| P-6 | Over-limit only blocks adding | Level drop, pulled habits | packs-manage, fixture overLimitL3 | Keep |
| P-7 | Custom pack area | Dropped by a rollback | packs-manage, radar, fixture customPackNoArea | Keep |
| P-8 | Older code re-saving newer records | Newer fields dropped | tests/decided-rules.test.ts (todo) | Decided |
| P-9 | Reports anchored on `createdAt` | Clock-ahead pack creation | not built | Clamp as S-2 at Stage 7 |
| O-1 | Retake dedupe by id and name | New phone before first pull; renamed template habit | onboarding-plan (014da79); device case 1b | S-4 covers it |
| O-2 | Relaunch reopens if killed before the first habit | Killed after it: the rest is not created | fixture halfOnboarded | Keep: a retake offers the rest |
| O-3 | Q10 never stored; replace deduped by name | Renamed replace habit is offered again | onboarding-plan | Keep |
| O-4 | Packs created when there are none | Existing user on a new phone | partial | Keep (known gap) |
| V-1 | Current schedule applied to the past | Frequency change rewrites history | tests/decided-rules.test.ts (pin) | Decided: pinned |
| V-2 | Deleted habits drop out of past days | Deleted and recreated: "starts" after months of use | fixture recreated; copy test in 1b | Decided |
| V-3 | Streak and Vitality disagree on deleted-only days | Documented | vitality | Keep |
| R-1 | Area entries of deleted habits kept | Large accounts: the map grows | 1b | Decided |
| F-1 | One reflections item "for years" | About 5 years reaches the 2 MB per-item read limit; a failed read reads as "none" | tests/decided-rules.test.ts (todo), fixture large | Decided |
| C-1 | `level:v2:N` keys | Pre-Stage-3 accounts | celebrations, fixture preStage3 | Keep |
| X-1 | XP recalculated from history | Level drop puts the account over its limit | packs-manage | Keep |

## Part C: invariant inventory

| Id | Invariant | Enforced in | Single-call test | Sequence test |
|---|---|---|---|---|
| P1 | A habit is in at most one pack | `addToPack`, `parsePacks` | yes | Phase 2 |
| P2 | No built-in pack holds two active habits with the same template name | upstream only (`pickStarters`, `missingTemplates`) | yes (T3, fixtures) | Phase 2 |
| P3 | Dropped templates never come back | `missingTemplates`, `joinTarget` | yes | Phase 2 |
| P4 | Pack names unique ignoring case, 1-24 characters | `packNameTaken`, validators | yes | Phase 2 |
| P5 | A corrupt record is never written over except by a user save | packsStore, `packsAfterRun` | yes | Phase 2 |
| P6 | Mirror equals the canonical record for its uid | `packsStoreCore.write` | yes | Phase 2 |
| L1 | Only adding is refused, exactly when room < adding | `checkAdd` | property (properties.test.ts) | Phase 2 |
| L2 | The limit message names the lowest level that gives room | `nextLimitLevel` | property (levels 1-20 x counts 0-60) | n/a |
| L3 | No path creates more than the room (except the first onboarding run) | callers | fixtures | Phase 2 |
| O1 | A retake never offers a template the user has, by id or name | `pickStarters` | yes, fixtures | Phase 2 |
| O2 | `addedTemplateIds` only grows, catalog ids only | `withAddedTemplates` | yes | partial (retry) |
| O3 | Q10 never reaches any store | `serialiseRecord` | yes | Phase 2 |
| X1 | XP is a pure function of the rows; un-tick then re-tick restores it | utils/gamification.ts | property | Phase 2 |
| X2 | Level follows 50·L·(L−1) and never falls as XP grows | gamification | property | n/a |
| X3 | Reflection XP: at most 3 a day, one per habit per day, only while ticked | `rewardedReflections` | property (dense days) | Phase 2 |
| V1 | Vitality in 0..100; starting exactly when no scheduled day closed; today's loss never shown | utils/vitality.ts | property | Phase 2 |
| R1 | Radar shares in [0,1]; states match the habits; today never counts | utils/radar/score.ts | property | Phase 2 |
| A1 | Area order pack > stored > icon; template area = pack area | utils/radar/areas.ts | yes | Phase 2 |
| F1 | One reflection per habit per day; text at most 200; never synced | reflections record, isolation | yes | Phase 2 |
| Y1 | Two phones converge after syncing with no new writes | engineCore + merge | no | Phase 3 |
| Y2 | Deletes are sticky | `mergeHabit` | yes | yes (engine) |
| Y3 | System rows never leave the phone | `isPushable` | yes | yes |
| Y4 | A user's latest write is never lost | not enforced under clock skew | clock-skew (todo) | Phase 3 |
| Y5 | A uid switch never applies data to the other uid | engineCore | yes | yes |
| ST | Every store: per uid, round-trips, never throws, tolerates unknown fields | each `*Core` | yes; unknown fields todo (P-8) | Phase 3 |

## Part D: model-based sequence tests (Phase 2)

A seeded node:test harness over the pure cores and the real `db/*Core` functions on node:sqlite. It applies random
sequences of real user actions and checks every Part C invariant after every step.

- **Actions:** onboard, retake, skip, Add the rest, pick packs, create a custom pack, add, rename, delete, move a habit,
  tick, untick, reflect, advance the day, move the clock, change timezone, level change, sign out and in as another
  uid, sync on either phone, go offline, kill the app.
- **World:** two phones from `tests/helpers/fake-firestore.ts`, store cores over Maps, an injected clock per phone.
- **Glue:** the onboarding and "Add the rest" call sequences live in screens today; the first step moves each into a
  pure `run*` function that both the screen and the harness call (no behaviour change, approved separately).
- **Seeds:** `tests/helpers/prng.ts` (mulberry32). `npm test` runs a fixed set (target under 3 s); `HQ_SEED=<n>`
  replays one seed; `HQ_RUNS=<n>` runs more. A failure prints the seed, the step and the invariant.
- **Shrinking:** actions are plain data, so replay is deterministic. Remove chunks, then single actions, then simplify
  parameters while it still fails, and print the minimal sequence as JSON plus a ready-to-paste test.
- **Expected finds:** the duplicate bug (onboard, Add the rest, retake: P2 fails in about 3 actions after shrinking),
  Y4 under a negative clock skew, P2 across phones before the first pull, P2 after a rename.

## Part E: fixtures and upgrade paths

Fixture accounts live in `tests/helpers/fixtures.ts` and run through every core in `tests/odd-state-fixtures.test.ts`:
dupCalmMind, overLimitL3, recreated, clockAhead, pulledFromB, preStage3, large, renamedPackHabit, customPackNoArea,
skippedThenRetake, everythingCorrupt, halfOnboarded, and twoUsersOnePhone (SQLite).

Every persisted format:

| Key or store | Versioning | Changes so far |
|---|---|---|
| SQLite `user_version` | 0 (legacy, wiped), 1, 2 | v2 added `alarm`, `remindBeforeMin` |
| `auth:lastUid:v1` | key | — |
| `profile:name:v1` | key; `{uid, ...}` | — |
| `packs:v1:<uid>` | `version: 1` | custom packs and `area` (Stage 2) |
| `packs:mirror:v1` | key | `dismissed` (Stage 1b) |
| `packs:chooseDismissed:v1:<uid>` | key | — |
| `onboarding:v1:<uid>` | `version: 1` | `answers` always null now (older records carry objects) |
| `onboarding:pending:v1:<uid>` | key | — |
| `reflections:v1:<uid>` | `version: 1` | per-year split decided (F-1) |
| `areas:v1:<uid>` | key | pruning decided (R-1) |
| `profile:outline:v1:<uid>` | key | — |
| `celebrated:v1:<uid>` | key | `level:N` to `level:v2:N` |
| `insight:v1:<uid>` | key | — |
| `sync:<uid>` | no version in the key; `PARSER_VERSION` inside | version 2 reset the cursors |
| `prefs:notifications:v1` | key; device-wide | — |
| `prefs:celebrations` | none; device-wide | — |
| `hq:startupTrace`, `hq:startupTrace:launches` | none | preview builds only |
| Firebase Auth persistence | owned by the SDK | — |

**Upgrade tests (Phase 3), golden snapshots.** `eas update:list` gives each published update's commit. For each commit,
and for the commit embedded in Build 2, export the tree into a throwaway folder (`git archive`) and run a small writer
script there that serialises representative records with that version's serialisers. Save the outputs as
`tests/fixtures/storage/<key>/<commit>.json`; tests assert today's parsers read every snapshot without loss. The
rollback test runs the old parsers from the throwaway folder against today's snapshots: no crash, and "corrupt" rather
than silently dropped fields. SQLite: v1 with real rows to v2 keeps the data, and a migration killed half-way retries.

## Part F: mutation testing

Run in a throwaway copy outside the repo, never in the working tree:

1. `git archive HEAD | tar -x -C <scratchpad>/hq-mut/base`, then copy in any new test files not committed yet.
2. In the copy: `npm ci --ignore-scripts --prefer-offline` (no junction to the real node_modules), then `git init`
   and a baseline commit.
3. A runner in the scratchpad applies each mutant (an exact replacement that must match exactly once), runs
   `node --experimental-strip-types --test tests/*.test.ts`, records killed or survived and the failing tests, and
   restores the file byte for byte. Output: a CSV.

33 mutants cover limits, membership, Add the rest, starters, the onboarding plan and record, packs creation, XP,
level, reflections, streaks, scheduling, Vitality, the radar window, area order, merge, push filtering, celebration
keys, the local date, the cold-start status and the startup mirror. No mutation tool (Stryker) for now: it has no
node:test runner, so it would run the whole suite per mutant, and it is a package change.

Phase 1a result: see "Status" below.

## Part G: beyond pure logic

| Option | Setup here | Cost | Flakiness | Value | Decision |
|---|---|---|---|---|---|
| Render tests (React Native Testing Library + jest-expo) | second runner, mocks; package change | 8-12 h | low-moderate | medium | later, only if needed |
| Maestro on the Itel over adb | adb in the SDK `platform-tools` (not on PATH); Maestro CLI separate; Java 25 present (check support) | 8-12 h | moderate | high | adopt, pre-release tier |
| Firebase emulator: rules tests and two-phone sync | Firebase CLI 15.34.2 and Java present; `@firebase/rules-unit-testing` in a separate folder with its own package.json | 8-12 h | low | high | adopt early |
| Accessibility | labels partly tested; TalkBack manual | 3-4 h | manual | high | adopt: script in the checklist, labels in Maestro |
| Performance | baseline below | 6-8 h | low with ratios | high | adopt |
| Crash and error reporting | Sentry or Crashlytics are native (next native build); a JS-only fallback can ship OTA | 8-16 h plus legal text | low | high | adopt with the release build |
| Play pre-launch report | an AAB on a testing track | 2-3 h | low | high | adopt at the release build |

**Performance baseline (Itel A60s, five-launch traces):** `auth:markerRead` about 1.5 s; `home:usable` about 2.5 to
2.8 s for accounts of 8 to 22 habits, growing roughly linearly with account size (8 to 20+ habits adds about 250 to
290 ms to usable and doubles stats compute).

- Device regression rule: before every publish that touches startup, Home or stats, run the five-launch trace on the
  fixed 22-habit reference account. Flag a median `home:usable` more than 200 ms above baseline, or stats compute more
  than 1.3 times baseline. Log each run (commit, update id, median) in a perf log.
- Node scaling: the real stats pipeline on generated accounts (20, 100, 300 habits x 1, 3, 5 years); assert ratios
  (doubling history costs under about 2.5 times, best of 5), not milliseconds. The full benchmark runs with `node`
  directly; one cheap ratio check sits in the suite. Today's `large` fixture (300 habits, about 100,000 completion
  rows, 3 years of reflections) computes in about 1 s on this PC.
- Very large account on the Itel: a dedicated test uid seeded locally (habits `synced = 1`, completions
  `updatedAt = 0`, so nothing is pushed), then a five-launch trace, then a budget (for example `home:usable` at most
  4 s with 2 years and 30 active habits).

**Crash reporting and privacy (Kenya Data Protection Act 2019, Play Data safety):** crash data is personal data.
Needed: a lawful basis (consent, or legitimate interest with an opt-out), a privacy policy update, "Crash logs" and
"Diagnostics" in the Data safety form, cross-border transfer safeguards, and scrubbing (no habit or pack names, no
reflection text, no email; user id hashed or left out). Proposed: a Settings switch "Send crash reports".

## Part H: manual checklist

In [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md): a 5-minute smoke list before every publish and a longer pre-release
list.

## Part I: process

1. Every spec rule gets an "Odd states" line: over-limit, level drop, deleted and recreated, clock skew, pulled from
   another phone, half-finished, renamed, older data, other uid, offline, large, timezone. Each names a behaviour (or
   "not applicable") and a test.
2. Every phone-found or user-found bug gets a regression test and a row in BUG_LOG.md (layer, assumption, check).
3. A new store or format ships with a version, a round-trip test, an unknown-fields test and a golden snapshot.
4. A stage is done when: tsc, lint and tests pass; its invariants are in the sequence harness; its odd-state fixtures
   pass; no mutant survives in its new code (a targeted run); the fingerprint check passes; the smoke list passes on
   the Itel; perf is logged if it touches startup or stats; the spec's odd-state lines are reviewed.
5. Plan reviews ask "what else writes this?" for every derived or deduplicated piece of state.

## Phases

| Phase | Contents | Hours | What it lets us claim |
|---|---|---|---|
| 1a (done) | Docs, property tests, fixtures, failing-first tests, mutation run | — | Invariants checked over odd states; release risks pinned by failing tests; the suite's power measured |
| 1b | Fixes for S-1, S-2, F-1, P-8 (their todos become normal tests); S-4, P-2, R-1, V-2 with their tests | 10-16 | The decided rules hold |
| 2 | Sequence harness, single phone, plus the screen-glue refactor | 12-16 | Random sequences of real actions keep the invariants |
| 3 | Two-phone harness with sync, clock skew, uid switch; golden snapshots and rollback tests | 14-22 | OTA on any old format never loses data; phones converge |
| 4 | Firebase emulator (rules, sync, restore cost); performance gate and large-account run | 14-20 | Rules proven; perf has a gate up to a large account |
| 5 | Maestro flows on the Itel; reflections size on the device | 11-18 | Device-only failures have scripted checks |
| 6 | Play pre-launch report; crash reporting with consent (native build) | 10-19 | Release-grade crash visibility |
| 7 | Render tests, only if still needed | 8-12 | — |

## Status

**Phase 1a (2026-11-09).** New tests: `tests/properties.test.ts` (L1, L2, X1-X3, V1, R1), `tests/odd-state-fixtures.test.ts`
(12 fixtures plus twoUsersOnePhone), `tests/clock-skew.test.ts` (S-1), `tests/decided-rules.test.ts` (S-2, F-1, V-1,
S-6, P-8), `tests/mutation-killers.test.ts` (M08, M20); helpers `prng.ts`, `fixtures.ts`, `fake-firestore.ts`.
Known failing rules are `todo` tests until Phase 1b.

Mutation score: the suite as committed killed 31 of 33 mutants. Survivors: M08 (adoption looked past a same-named habit
already in another pack; a real gap) and M20 (`isScheduledOn` ignoring `deleted`; equivalent today, since every
caller filters deleted habits first). With the new tests and the two killers: 33 of 33.

### Phase 1b test cases (written with the fixes)

S-4, template-creating actions wait for this uid's first pull:
- S4-1: "Add the rest" with the first pull not done creates nothing and says it is waiting; after it, it creates.
- S4-2: a Settings retake before the first pull creates nothing; once the pull is done, the plan is rebuilt with the
  pulled names and offers none of them.
- S4-3: two phones: A has Steady Energy's four habits synced; B is new and offline, picks Steady Energy, taps "Add the
  rest": nothing is created. B comes online and pulls; the next tap adopts by name. The server holds 4 habits, not 8.
- S4-4: once the first pull is done, later offline use is not blocked.
- S4-5: a different uid on the same phone waits for its own first pull, even though the previous user's was done.

P-2, a renamed template habit is dropped from its built-in pack:
- P2-1: renaming the only "Walk for 20 minutes" in Steady Energy puts walk20 in `dropped`; "Add the rest" then creates
  nothing for walk20.
- P2-2: renaming one of two members carrying that name changes nothing.
- P2-3: renaming it back to the template name takes walk20 out of `dropped` (the existing "putting it back" rule).
- P2-4: renaming an unpacked habit or one in a custom pack changes no pack.
- P2-5: a rename that only changes case or spacing is not a rename of the template.

R-1, area entries of deleted habits are pruned at the next write:
- R1-1: a write removes entries whose habit is deleted.
- R1-2: a read never writes.
- R1-3: an entry for a habit moved into a pack is kept (used again if it leaves the pack).
- R1-4: unreadable storage is never written over, so nothing is pruned.

V-2, "Restarts after your first full day.":
- V2-1: Vitality starting and any completed row before today (deleted habits included): "Restarts after your first
  full day." (fixture recreated).
- V2-2: starting with no completion history: "Starts after your first full day."
- V2-3: un-ticked rows and future-dated rows are not history.
- V2-4: the accessibility label uses the same text.
