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
| S-1 | Every user write stamps `updatedAt = max(now, row.updatedAt + 1)` (monotonic per row). Unsynced rows more than a day ahead are re-stamped to now before a push (guarded). A "clock suspect" counter drives one muted Settings line. Cross-device clock skew is a documented last-write-wins limit. **Built in Phase 1b.** | HABITQUEST_DESIGN.md |
| S-2 | A habit's `createdDate` is clamped to `min(createdDate, today)`, and only that, wherever it is computed with `today`. | HABITQUEST_DESIGN.md |
| S-4 | Template-creating actions ("Add the rest", a Settings retake, later a report's "Add" suggestion) wait for the first pull of this uid on this phone ('done' from the engine or the stored sync state; 'unknown' when unreadable also waits). | PACKS_REPORTS_SPEC.md §17, ONBOARDING_SPEC.md §5 |
| S-6 | Notification and celebration settings are device settings, shared by every account on the phone. | HABITQUEST_DESIGN.md |
| P-2 | Renaming or deleting the only habit in a built-in pack that carries a template's name adds that template to the pack's `dropped`; renaming back takes it out. | PACKS_REPORTS_SPEC.md §17 |
| P-4 | ONBOARDING_SPEC §11 reworded: only the first run never checks limits; a Settings retake is checked. | ONBOARDING_SPEC.md §11 |
| P-8 | Parsers accept and ignore unknown fields; a save keeps fields it does not know (only fields from parsing; a known field always wins). Exceptions: the onboarding record keeps its privacy whitelist; the starting outline is replace-only. Newer builds never change a field's type or widen its values, and these records stay at version 1 (a breaking change uses a new key). | HABITQUEST_DESIGN.md, PACKS_REPORTS_SPEC.md §17 |
| F-1 | Reflections are split per year (`reflections:v2:<uid>:<yyyy>`, marker `reflections:migrated:v2:<uid>`, v1 read but never written); a failed read never lowers XP or level (the last numbers stay; with none, Home's placeholder; limit checks never name an unknown level). | PACKS_REPORTS_SPEC.md §12, §17 |
| V-1 | The current schedule is applied to past days (accepted limitation), pinned by a test. | PACKS_REPORTS_SPEC.md §13, §17 |
| V-2 | When Vitality is starting and the account has completion history, the copy is "Restarts after your first full day." | PACKS_REPORTS_SPEC.md §13, §17 |
| R-2 | A completing tick always gets its reflection offer, celebrations and toast, even when a newer list load overtakes its own; the newest tap wins; an offer resolving after Home lost focus or after midnight is dropped. | PACKS_REPORTS_SPEC.md §16, BUG_LOG.md |
| R-3 | The reflection bar's 8 s (20 s with a screen reader) count only while no level-up or streak overlay covers it; it gets a full 8 s once uncovered, and its announcement waits until then. | PACKS_REPORTS_SPEC.md §16, BUG_LOG.md |
| R-1 | Area-map entries of habits known deleted are pruned at the next area write; storage that couldn't be read is never written over (every store; exempt list with reasons in the spec). | PACKS_REPORTS_SPEC.md §11, §17 |

Open, not decided: S-5 (Firestore read cost of restoring a large account; measure in the emulator first) and the
clock-status copy (proposal in the Phase 1a report).

## Part A: post-mortem of the five bugs

The table, and every phone-found bug from now on, lives in [BUG_LOG.md](BUG_LOG.md). Pattern: three of the five
(duplicate, limit, Vitality) were the spec's own assumptions about a normal account; two needed a phone (flash,
keyboard).

## Part B: spec red-team (rules that only hold for a normal account)

| # | Rule | Odd state | Test of the odd state | Rule now |
|---|---|---|---|---|
| S-1 | Last-write-wins on client `updatedAt` | Clock behind or moved back: the edit is refused or replaced by the next pull. Clock more than a day ahead: nothing pushes. | tests/clock-skew.test.ts, sync-status-line.test.ts, stamp.test.ts | Built (1b) |
| S-2 | `createdAt` from the client clock | A habit created with the clock ahead is unscheduled until its future date | tests/decided-rules.test.ts | Fixed (1b) |
| S-3 | Completions after today are ignored | A tick made with the clock ahead counts later | gamification, summary, fixture clockAhead | Keep |
| S-4 | Sync at launch, foreground, every 5 min | New phone offline before its first pull: "Add the rest" or a retake re-creates templates that exist on the other phone | tests/s4-first-pull.test.ts (S4-1 to S4-5) | Built (1b) |
| S-5 | One completion doc per ticked day | Restoring a large account reads many docs (Firestore free tier: 50k reads a day for the whole project) | none | Measure (Phase 4) |
| S-6 | Per-user data | Notification and celebration prefs are device-wide | tests/decided-rules.test.ts (pin) | Decided: device settings |
| S-7 | Local date everywhere | Travelling east skips a local date; west repeats one | partial | Keep, document |
| P-1 | One pack per habit | A record listing an id twice | packs-record | Keep |
| R-2 | The list reload after a tick returns that tick's rows | A newer load (another tick, focus, sync pull, refresh) overtakes it: the offer, celebrations and toast are dropped | tests/r2-offers.test.ts | Built (1b) |
| R-3 | The bar is visible for its whole 8 s | A level-up or streak overlay covers it while its timer runs | tests/r3-bar-timer.test.ts | Built (1b) |
| P-2 | Template present by name | A renamed (or deleted) pack habit makes "Add the rest" re-create the template | tests/p2-rename-delete.test.ts, fixture renamedPackHabit (pinned) | Built (1b) |
| P-3 | Adoption by name | Two same-named habits; one already packed | packs-membership, mutation-killers (M08) | Keep |
| P-4 | Retake limits | ONBOARDING §11 contradicted PACKS §2b | packs-manage | Reworded |
| P-5 | "Add the rest" level fallback 1 | Too little room (safe), possibly the wrong level named | none | Keep; test that the fallback never allows more |
| P-6 | Over-limit only blocks adding | Level drop, pulled habits | packs-manage, fixture overLimitL3 | Keep |
| P-7 | Custom pack area | Dropped by a rollback | packs-manage, radar, fixture customPackNoArea | Keep |
| P-8 | Older code re-saving newer records | Newer fields dropped | tests/decided-rules.test.ts (P-8) | Built (1b) |
| P-9 | Reports anchored on `createdAt` | Clock-ahead pack creation | not built | Clamp as S-2 at Stage 7 |
| O-1 | Retake dedupe by id and name | New phone before first pull; renamed template habit | onboarding-plan (014da79); device case 1b | S-4 covers it |
| O-2 | Relaunch reopens if killed before the first habit | Killed after it: the rest is not created | fixture halfOnboarded | Keep: a retake offers the rest |
| O-3 | Q10 never stored; replace deduped by name | Renamed replace habit is offered again | onboarding-plan | Keep |
| O-4 | Packs created when there are none | Existing user on a new phone | partial | Keep (known gap) |
| V-1 | Current schedule applied to the past | Frequency change rewrites history | tests/decided-rules.test.ts (pin) | Decided: pinned |
| V-2 | Deleted habits drop out of past days | Deleted and recreated: "starts" after months of use | fixture recreated; copy test in 1b | Decided |
| V-3 | Streak and Vitality disagree on deleted-only days | Documented | vitality | Keep |
| R-1 | Area entries of deleted habits kept | Large accounts: the map grows | tests/r1-storage.test.ts (R1-1 to R1-5), fixture large | Built (1b) |
| F-1 | One reflections item "for years" | About 5 years reaches the 2 MB per-item read limit; a failed read reads as "none" | tests/decided-rules.test.ts (F-1), tests/reflections-years.test.ts, fixture large | Built (1b) |
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
| Y4 | A user's latest write is never lost (except the documented cross-phone skew limit) | `db/stamp.js`, `restampFutureRows` (S-1) | clock-skew | partial (clock-skew sequences); Phase 3 |
| Y5 | A uid switch never applies data to the other uid | engineCore | yes | yes |
| ST | Every store: per uid, round-trips, never throws, tolerates unknown fields | each `*Core` | yes; unknown fields kept (P-8: packs and mirror, areas, reflections, notification settings; celebrated and the celebrations switch pinned) | Phase 3 |

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
| `reflections:v1:<uid>` | `version: 1` | read only since F-1 (copied into the year items, never written; delete after the next store build) |
| `reflections:v2:<uid>:<yyyy>` | key; `version: 1` inside | F-1 (Phase 1b): one item per year |
| `reflections:migrated:v2:<uid>` | key; `version: 1` inside | F-1 marker: `years`, `v1Length` |
| `profile:pending:v1:<uid>` | key; `version: 1` inside | orphan fix (2026-11-14): sign-up's profile details until the users doc lands; never re-saved |
| `areas:v1:<uid>` | key | R-1 (Phase 1b): deleted habits' entries pruned at the next write; never written over when unreadable |
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

**Phase 1b, S-1 (2026-11-09).** Built: `db/stamp.js` (the monotonic stamp at updateHabit, softDeleteHabit and
toggleCompletion), `restampFutureRows` (guarded), the engine's `clockSuspectCycles`, `utils/syncStatusLine.ts` and the
Settings line. Its three todo tests are normal tests now. Suite: 992 tests, 989 pass, 3 todo (S-2, F-1, P-8).

**Phase 1b, S-2 (2026-11-10).** Built: `clampCreatedDates` (utils/gamification.ts), applied on entry by
`computeStreaks`, `countPerfectDays`, `dailyCompletion` and `computeSummary`; the radar and Vitality get it through
`dailyCompletion`. The S-2 todo is a normal test now, plus a test that the clamp never moves a date earlier and a scan
that fails if a new app file reads `createdDate`. Each clamp was removed in turn: 2 tests fail each time.

**Phase 1b, P-8 (2026-11-13).** Built: `utils/unknownFields.ts` (keys kept from parsing, written before the known
fields), applied to the packs record and the mirror's copy of it, the area map, the reflections record (unreadable
entries count as "already reflected", no XP) and the notification settings; `runPacks` keeps an empty record's fields.
The P-8 todo is a normal test now, plus one rollback test per record (the real store cores over Maps), pinning tests
for the celebrated keys and the celebrations switch, negative tests (a property added in memory, a forged known key,
a stored `__proto__`) and a scan that fails if a file other than the parsers creates carried fields. Suite: 1066
tests, 1065 pass, 1 todo (F-1).

**Phase 1b, F-1 (2026-11-13).** Built: reflections in one item per year (`reflections:v2:<uid>:<yyyy>`) with the
marker `reflections:migrated:v2:<uid>`, through the P-8 parser and serialiser unchanged (year helpers in
`utils/reflections/record.ts`, store in `services/reflectionsStoreCore.ts`); v1 read, merged in, never written. A
failed read rejects: the stats load publishes nothing, Home keeps the last numbers (or its placeholder with none),
the bar offers nothing, limit checks use the last level or a ticks-only lower bound and never name an unknown level.
The F-1 todo is a normal test now. New: `tests/reflections-years.test.ts` (migration in one multiSet, a later run's
reads, new account, kill mid-migration on Android and iOS-like storage, a missing year refilled, a save carrying
owed writes, the rollback window, v1 unreadable before and after the marker, failed reads, the year boundary, a
wrong-clock year, sizes with the 20-a-day case pinned, P-8, fixtures large and everythingCorrupt, `u1`/`u10`),
`tests/helpers/kv-storage.ts`, and F-1 tests in `tests/decided-rules.test.ts` (rejects, the shared entry keeps the
last level, Home's rule, limit checks at an unknown level, the ticks-only lower bound). Changed: reflections-store,
home-loading (a failed load keeps the placeholder), packs-manage (the check is `checkAddAtLevel`). Suite: 1092 tests,
1092 pass, 0 todo.

**Phase 1b, R-1 (2026-11-13).** Built: the area map's prune of habits known deleted (`getDeletedHabitIds`,
`pruneAreas`), and "storage that couldn't be read is never written over" in the areas, packs (`PacksUpdateResult`,
`onPacksUpdate`), onboarding, celebrated, insight-cache, sync-cursor and startup-trace stores. The sync engine ends a
cycle whose cursor read fails before any network call, counts such cycles (`cursorReadFailures`), and Settings shows
the approved cursor line from 3. New: `tests/r1-storage.test.ts`. Changed: packs-record (update resolves
`'unreadable'` without calling the change), cursor-store (an unreadable load rejects), sync-status-line (the cursor
line, and `sync/syncEngine.js` reads its threshold for the log). Two mutations were checked by hand (the areas guard
and the cycle stop): each fails R-1 tests. Suite: 1119 tests, 1119 pass, 0 todo.

**Phase 1b, S-4 (2026-11-13).** Built: `firstPullFor(uid)` (sync/syncEngine.js, sharing the engine's cursor store) over
`firstPullResult` and `whenRestored` (utils/firstPull.ts); Home's "Add the rest" and the Settings plan row run only on
'done', otherwise they show the approved line. Step 0 of the same change: `celebratedStore.known()` and
`celebrationsOrHeld` hold celebrations while the celebrated keys can't be read. New: `tests/s4-first-pull.test.ts`
(two phones on `tests/helpers/fake-firestore.ts`, which now also returns each device's cursor store). Two mutations
were checked by hand (an unreadable state counted as 'done'; held celebrations ignored): each fails 2 tests. Suite:
1133 tests, 1133 pass, 0 todo.

**Phase 1b, P-2 (2026-11-13).** Built: `renameInPack` and `deleteFromPack` (utils/packs/manage.ts), run by the habit
form on a rename (before any pack move) and after a delete, with one read of the active habits. New:
`tests/p2-rename-delete.test.ts`. Changed: odd-state-fixtures (renamedPackHabit is a pin now). Two mutations were
checked by hand (another carrier ignored; a delete never dropping): each fails 2 tests. Suite: 1148 tests, 1148 pass,
0 todo.

**Phase 1b, orphan Auth accounts, parts (a) and (b) (2026-11-14).** Built: sign-up saves the profile details on the
phone first and completes the users doc later (`utils/profilePending.ts`, `services/profileCompletionCore.ts`,
`services/profileCompletion.ts`; 10 s write timeout, no rollback delete), and "Finish setting up your account"
(`app/profile-setup.tsx`), opened by `services/useDisabledCheck.ts` only on a server-confirmed missing profile. New:
`tests/orphan-profile.test.ts`: the completer (first try, a timeout with a late landing, offline, a permanent refusal,
two phones racing, per uid, an unreadable or corrupt record, two runs at once), sign-up (order, no rollback, the
timeout, a kill after the details were saved, off the startup path), recovery (only on a confirmed missing profile, the
approved copy, under 18 signs out and writes nothing, no back, the failure line, an existing profile opens nothing;
admins: an admin with no profile never sees the screen and its pending record is left alone, a failed admin read opens
and completes nothing, a normal user with no profile still sees it, and admins/{uid} is read only when the profile is
missing) and the rollback-bundle case. Changed: the sign-up pins in auth-session, onboarding-0b, onboarding-gate and
profile-name. Three mutations were checked by hand (recovery on an unknown profile; a write without reading the server
first: each fails 1 test; the admin guard removed: fails 3). (c) the stats orphan count and (d) find-orphans.mjs are
later steps. Suite: 1171 tests, 1171 pass, 0 todo.

**Phase 1b, R-2 (2026-11-14).** Built: `loadHabits` returns its rows when a newer load overtakes it (the screen still
shows only the newest); every tap is numbered, and the offer queue (`utils/reflections/offers.ts`) and the toast order
(`createTickOrder`, utils/celebrations.ts) follow tap order; the same fix restores the tick's celebrations and toast; an
offer that resolves after Home lost focus or after midnight is dropped. New: `tests/r2-offers.test.ts` (R2-1 to R2-9
and the toast order). Two mutations were checked by hand (tap order ignored: fails 2; the focus rule dropped: fails
1). R-3 is the next build. Suite: 1182 tests, 1182 pass, 0 todo.

**Phase 1b, R-3 (2026-11-14).** Built: `coversBar` (utils/celebrations.ts: only the level-up and streak overlay) and
`createBarTimer` (utils/reflections/barTimer.ts, with injected timers); Home passes `covered`, and the bar's timer runs
only while uncovered, starting a full 8 s (20 s with a screen reader) each time it is uncovered, with its announcement
deferred until then. New: `tests/r3-bar-timer.test.ts` (R3-1 to R3-9 and the duration-unknown case, on a fake clock).
Two mutations were checked by hand ("covered" ignored: fails 5; announced while covered: fails 2). Suite: 1192 tests,
1192 pass, 0 todo.

### Phase 1b test cases (written with the fixes)

S-1, monotonic stamp, stuck rows and the clock line (done; tests/clock-skew.test.ts unless noted):
- S1-1 to S1-3: clock moved back on one phone, B one hour behind renaming, and B un-ticking: the edit reaches the server
  and the other phone (were todo).
- S1-4: the cross-phone last-write-wins limit (pinned, unchanged).
- S1-5: two edits in the same millisecond: the second stamp is the first + 1.
- S1-6: the same for two toggles of today's completion.
- S1-7: clock moved back: the edit and the delete stamp previous + 1.
- S1-8: a new habit is stamped now; a tick over a system row (0) is stamped now.
- S1-9: system rows keep 0 and are never pushed.
- S1-10: a pulled row keeps the remote `updatedAt`.
- S1-11: re-stamp: this uid's unsynced habits and completions more than a day ahead become now.
- S1-12: re-stamp never touches synced rows.
- S1-13: re-stamp never touches another uid's rows.
- S1-14: boundaries: exactly a day ahead and system rows are left alone.
- S1-15: guarded: no re-stamp when no dirty row needs it.
- S1-16: end to end: refused while 3 days ahead; re-stamped and pushed once the clock is fixed; the other phone gets it.
- S1-17: an edit queued just before or just after the re-stamp keeps its content and is pushed.
- S1-18: clock 2 days ahead: counter 1 (hidden), 2 (line shown); fixed clock and an accepted push: 0 (hidden).
- S1-19: not suspect when the pull did not reach the end, or when the refused row was stamped more than a day ago.
- S1-20: stop() and start() reset the counter.
- S1-21: the counter rule as a pure function.
- S1-22 (sync-status-line.test.ts): `clockLine` hidden below 2 cycles, the exact copy from 2.
- S1-23 (sync-status-line.test.ts): only Settings, its hook, the engine and the copy module reference the clock state.
- S1-24 (stamp.test.ts): `nextUpdatedAt` and both SQL fragments agree on node:sqlite.
- S1-25: the app's store (db/sync.js) provides `restampFutureRows` (optional in the engine's type) through the write
  queue.

S-4, template-creating actions wait for this uid's first pull (built 2026-11-13, tests/s4-first-pull.test.ts; also: the
check's four outcomes, the approved line and its wiring in Home, Settings and sync/syncEngine.js, the R-1 interplay
(unreadable cursors: 'unknown', nothing runs, no network call), a corrupt stored state, a parser-version bump, "Re-sync
everything", fixtures pulledFromB and skippedThenRetake, and step 0's held celebrations):
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
- Also (built 2026-11-13, tests/p2-rename-delete.test.ts): a rename from one template's name to another's; a rename
  with a move (old pack first, then the move); deleting the only walk20 (dropped, "Add the rest" creates nothing for
  it); deleting one of two carriers, an unpacked habit, a custom-pack habit or a non-template habit (no change); the
  habit form is the only delete path and there is no undo; an unreadable active list or pack record (no change,
  silent); a pack's unknown fields kept (P-8); a retake's starter for a dropped template joins no pack. Fixture
  renamedPackHabit is pinned: a rename from before P-2 isn't repaired.

R-1, area entries of deleted habits are pruned at the next write (built 2026-11-13, tests/r1-storage.test.ts):
- R1-1: a write removes entries whose habit is deleted, readable and kept unreadable (P-8) alike; a prune alone is
  written even when the area is unchanged.
- R1-2: a read never writes.
- R1-3: an entry for a habit moved into a pack is kept (used again if it leaves the pack).
- R1-4: unreadable storage is never written over, so nothing is pruned (the save resolves false).
- R1-5: a failed read of the deleted ids prunes nothing (the area is still saved); a habit not on this phone is never
  "deleted" (only SQLite `deleted = 1`); another uid's map is untouched; two writes at once both land.
- Fixtures: large (one write prunes 150 entries; size before and after), everythingCorrupt (a corrupt map is still
  replaced).

R-1, storage that couldn't be read is never written over (built 2026-11-13, tests/r1-storage.test.ts):
- Packs: the picker's, the edit screen's and delete's changes each get `'unreadable'` and write nothing; each screen's
  handler shows its existing alert; every `packsStore.update` goes through `onPacksUpdate`.
- Onboarding: a retake on an unreadable record creates its habits, writes no record, and the next plan excludes them
  by name.
- Celebrated and the insight cache: nothing written while unreadable, no repeat in the run, merged and saved later.
- Sync cursors: the cycle ends before any network call, no cursor write, `initialPullDone` unchanged; the count reaches
  3 and Settings' line shows; the next good read clears it; sign-out and sign-in reset it; never an automatic reset.
- Startup trace, and pins for reflections and the notification settings.

R-2, every tick keeps its offer, celebrations and toast (built 2026-11-14, tests/r2-offers.test.ts):
- R2-1: a tick whose list load was overtaken still offers (loadHabits returns its rows; Home passes them).
- R2-2: its celebrations and toast are no longer lost either (onTick gets the rows and the tap number).
- R2-3: two quick ticks: the newest tap's bar wins when the older tap's offer starts last, and when its read finishes
  last.
- R2-4: an un-tick drops that habit's offer, while it reads or before it starts; another habit's offer stays.
- R2-5 (F-1): reflections that can't be read: no bar, and an older bar is cleared.
- R2-6: a reflection save racing a list load: the save counts toward the 3-a-day cap; the saved habit is never offered.
- R2-7: an offer that resolves after Home lost focus is dropped.
- R2-8: a tap just before midnight: offered if it resolves the same day, dropped if the day is over.
- R2-9: only a reflection that would still pay is offered.
- Toasts: the newest tap keeps its toast whatever order ticks arrive in; a saved reflection drops the toasts before it.

R-3, the bar's time counts only while uncovered (built 2026-11-14, tests/r3-bar-timer.test.ts):
- R3-1: uncovered from the start: announced at once, gone after 8 s.
- R3-2: an overlay that outlasts the timer: shown at 2 s, dismissed at 30 s; the bar goes 8 s after Continue (38 s),
  announced once.
- R3-3: already covered at mount: no timer and no announcement until uncovered.
- R3-4: two overlays back to back (a level-up, then a streak): paused across both.
- R3-5: a newer bar replaces a paused one: the old timer never fires.
- R3-6: an un-tick, Home losing focus or the day changing while paused remove the bar; no expiry after.
- R3-7: only the level-up and streak overlay pause it; a toast or the perfect-day banner doesn't.
- R3-8: celebrations off, or held by S-4: no overlay, so no pause.
- R3-9: with a screen reader: 20 s, and a full 20 s again after an overlay.
- Also: nothing runs until the screen-reader check answers; the announcement comes from the timer, not at mount.

V-2, "Restarts after your first full day.":
- V2-1: Vitality starting and any completed row before today (deleted habits included): "Restarts after your first
  full day." (fixture recreated).
- V2-2: starting with no completion history: "Starts after your first full day."
- V2-3: un-ticked rows and future-dated rows are not history.
- V2-4: the accessibility label uses the same text.
