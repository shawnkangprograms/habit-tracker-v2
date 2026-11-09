# Release checklist (Itel A60s)

Run on the Itel with the build or update about to ship (docs/TEST_STRATEGY.md, Part H). Before every publish, also
check that `expo-updates fingerprint:generate --platform android` still ends `d820d50154d72f636213ae4251d04c3f0beb8f8a`.

## Smoke list (about 5 minutes, before every publish)

- [ ] Two cold starts, then Settings > long-press the version line: "Update:" shows the id just published.
- [ ] Cold start: nothing untrue on screen and no layout jump (pack cards, stats card, greeting).
- [ ] Tick and untick a habit: the reflection bar appears and goes; XP and Vitality move.
- [ ] Habit form: focus the last field; Save stays visible above the keyboard. Back out.
- [ ] At or over the habit limit, "Add a habit" names the right level.
- [ ] The Home radar opens Summary.
- [ ] TalkBack: the Home stats card and the radar are read in words.

## Pre-release list (about 40 minutes, before a public release or a native build)

Sign-up and onboarding
- [ ] Sign-up with the age gate (17 refused, 18 accepted), then onboarding finished.
- [ ] Onboarding skipped ("Skip setup?", then "Taking you home...").
- [ ] Onboarding killed mid-way: before the first habit it reopens; after it, a Settings retake offers the rest.
- [ ] Settings retake on an account that has template habits: no duplicates offered or created.

Packs
- [ ] "Add the rest"; create, edit and delete a pack; move a habit between packs.
- [ ] Over the pack limit: the caption names the right level.

Keyboard
- [ ] On all 6 form screens (habit form, pack edit, reflection, your name, sign-in, sign-up), the focused field and the
      Save or primary button stay visible above the keyboard.

Two phones (iPhone and Itel, same account)
- [ ] Edit the same habit on both; the later edit wins on both.
- [ ] Delete on one; it disappears on the other and does not come back.
- [ ] Tick offline on one, reconnect; the tick arrives on the other.
- [ ] One phone's clock set 1 hour behind: an edit there still reaches the other phone (S-1; expected to fail until
      Phase 1b ships).

Time
- [ ] Midnight with the app open: Home moves to the new day; yesterday's loss appears on Vitality.
- [ ] 24 hours offline (airplane mode), then reopen and reconnect: nothing lost, sync catches up.

Updates and performance
- [ ] OTA apply: publish, two cold starts, the trace panel shows the new update id.
- [ ] Five-launch trace on the 22-habit reference account; log it. Flag `home:usable` more than 200 ms above baseline
      (about 2.5 to 2.8 s) or stats compute more than 1.3 times baseline.
- [ ] Launch the large-account test uid; log the trace.

Accounts
- [ ] Sign out, sign in as a different account: no greeting, packs, reflections or reminders from the first account.

Display and memory
- [ ] Largest font size; light and dark theme.
- [ ] Back to the app after a memory-heavy app (camera): state is intact.

TalkBack (full script)
- [ ] Onboarding: every option, the Q11 slider (adjustable, increment and decrement), routine cards.
- [ ] Home: stats card, Vitality, pack cards, reflection bar announcement, radar card.
- [ ] Reflection screen: the four questions, the text field, Save's disabled hint.
- [ ] Summary: the radar description in words.
