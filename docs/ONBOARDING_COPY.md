# HabitQuest onboarding: copy tables (v1)

Companion to ONBOARDING_SPEC.md. All copy is original. Keys match the enum values in the spec so code can look lines up directly. Length limits are noted per table and are checked by a unit test.

## 1. "What you told us" reflections (max 60 characters each)

Three cards. The label is fixed; the line depends on the answer. Quotes are first person.

Card 1, label "YOUR CHALLENGE", keyed by Q5:

| key              | line                                         |
| ---------------- | -------------------------------------------- |
| time             | I never seem to have enough time.            |
| focus            | Distractions keep pulling me off track.      |
| procrastination  | I put things off until it's almost too late. |
| low_energy       | My energy runs out before the day does.      |
| balance          | Work and life fight over the same hours.     |
| study_focus      | I sit down to study and my mind wanders.     |
| overwhelmed      | There's so much to learn that I freeze.      |
| memory           | I study hard, but it doesn't stick.          |
| study_motivation | I can't find the drive to open the books.    |

Card 2, label "YOUR RHYTHM", keyed by Q8:

| key           | line                                                |
| ------------- | --------------------------------------------------- |
| predictable   | My days run on a steady routine.                    |
| mostly        | My days mostly hold together, with a few surprises. |
| weekly_change | Every week looks a little different.                |
| chaotic       | Right now my days feel unpredictable.               |

Card 3, label "WHAT DERAILS YOU", keyed by Q6:

| key             | line                                                   |
| --------------- | ------------------------------------------------------ |
| stress          | When stress hits, my routine is the first thing to go. |
| boredom         | When I get bored, I drift off my plan.                 |
| low_motivation  | Some days the motivation just isn't there.             |
| environment     | My surroundings make good habits harder.               |
| social_pressure | Other people's plans pull me off mine.                 |

## 2. Habit reason lines (max 60 characters each)

Shown on each routine card.

| template id    | reason                                            |
| -------------- | ------------------------------------------------- |
| walk20         | Light movement lifts energy and mood.             |
| stretch10      | Loosens a stiff body and resets your focus.       |
| water_meals    | An easy cue for steady energy all day.            |
| lights_out     | A fixed bedtime fixes your mornings too.          |
| screens_off    | Late screens keep your brain awake.               |
| breathe5       | Five slow minutes calm a racing mind.             |
| journal3       | Getting thoughts out makes them lighter.          |
| plan_top1      | Decide tonight so tomorrow starts easy.           |
| focus25        | One protected block beats a scattered day.        |
| study25        | A short timed session beats a long delayed one.   |
| review10       | A quick review is how memory sticks.              |
| skill15        | Small daily practice compounds into real skill.   |
| message_friend | Connection grows from small, regular check-ins.   |
| family_time    | Time together is easy to skip and hard to regret. |

Replace habits from Q10 (generic on purpose):

| Q10 answer      | habit name                 | reason                                            |
| --------------- | -------------------------- | ------------------------------------------------- |
| phone_social    | Phone-free first hour      | Own the first hour before the feed does.          |
| porn            | Phone out of the bedroom   | Keeping it out of reach makes late nights easier. |
| smoking_vaping  | Fresh-air morning          | Win the morning first; the rest gets easier.      |
| gaming          | Gaming stops at a set time | A clear stop time keeps play fun, not draining.   |
| junk_food       | Cook one real meal         | One real meal a day resets what you reach for.    |
| alcohol         | Clear-headed evening       | Clear evenings mean better sleep and mornings.    |
| procrastination | Start with just 5 minutes  | Five minutes gets you past the hardest part.      |

## 3. Habit Profile focus card

Title is "Your plan will focus on <display name>". Subtitle by focus axis (max 90 characters).

| axis       | display name              | subtitle                                                                       |
| ---------- | ------------------------- | ------------------------------------------------------------------------------ |
| Discipline | Discipline & Habits       | Small, repeatable wins help you rebuild momentum without overloading your day. |
| Health     | Health & Energy           | Gentle daily movement, sleep and food habits to build steady energy.           |
| Mind       | Mind & Calm               | Short, calming habits to quiet your head and sharpen your focus.               |
| Career     | Career & Growth           | Focused work blocks and skill-building to move your goals forward.             |
| Learning   | Learning & Study          | Short, regular study sessions that help knowledge stick.                       |
| Relations  | Relationships & Belonging | Small, regular moments of connection with the people who matter.               |

## 4. Building Profile

Status word under the percentage: 0 to 89% "BUILDING", 90 to 99% "ALMOST THERE", 100% "READY".
Title: "Building your habit profile."
Checklist rows, in order: "Scanning your answers", "Mapping your focus areas", "Detecting your habit type", "Preparing your plan".

## 5. Optional: Day-1 moves (on the "What you told us" screen, below the cards)

Only if the build allows. Three rows per focus axis: Tonight, Tomorrow, This week. Title max 32 characters, line max 40.

| axis       | when      | title                            | line                               |
| ---------- | --------- | -------------------------------- | ---------------------------------- |
| Health     | Tonight   | Set out your walking shoes       | Remove tomorrow's first excuse.    |
| Health     | Tomorrow  | Walk for 20 minutes              | Any pace counts.                   |
| Health     | This week | Pick a fixed bedtime             | Same time, even on weekends.       |
| Mind       | Tonight   | Write down what's on your mind   | Three lines is enough.             |
| Mind       | Tomorrow  | Breathe for 5 minutes            | Before you check your phone.       |
| Mind       | This week | Choose a daily quiet moment      | Same time each day.                |
| Discipline | Tonight   | Pick tomorrow's one task         | Decide now, not in the morning.    |
| Discipline | Tomorrow  | Do that task first               | Before messages and social media.  |
| Discipline | This week | Choose a daily cut-off time      | A clear end makes starting easier. |
| Career     | Tonight   | Write your goal for the week     | One sentence is enough.            |
| Career     | Tomorrow  | One 25-minute focus block        | Phone in another room.             |
| Career     | This week | Practise one skill daily         | Fifteen minutes is plenty.         |
| Learning   | Tonight   | Pick what to study first         | Start with the hardest topic.      |
| Learning   | Tomorrow  | Study for 25 minutes             | One timer, one subject.            |
| Learning   | This week | Review your notes twice          | Short reviews beat cramming.       |
| Relations  | Tonight   | Think of someone to reach out to | Just one person.                   |
| Relations  | Tomorrow  | Send that message                | A short hello counts.              |
| Relations  | This week | Plan one shared meal or call     | Put it in your diary.              |

## 6. Loading quotes (max 70 characters each)

Shown only on waits the app controls (Building Profile and similar), never held at cold start. Rotate about every 2.5 seconds, random order, no immediate repeats. The Swahili proverbs (methali) are traditional and public. Please have a fluent speaker confirm the wording before release.

Original one-liners:

1. Small steps still leave footprints.
2. Skip the perfect plan. Start the ugly one.
3. Today's five minutes is tomorrow's momentum.
4. Streaks are built on ordinary Tuesdays.
5. You don't need more motivation, just a smaller first step.
6. Missed a day? The next one is a fresh page.
7. Consistency is quiet, and it adds up loudly.
8. Progress has no speed limit, only a direction.
9. One checked box can change the mood of a whole day.
10. Tired is a reason to go slower, not to stop.
11. Rest is part of the plan, not a break from it.
12. Do it badly, then do it again tomorrow.
13. Starting late still beats not starting.
14. Tiny habits, patient weeks, surprising results.
15. Doing it now is a gift to tomorrow's you.
16. Energy follows action more often than the other way round.
17. A calm start makes a clearer day.
18. Nobody remembers the perfect streak, only the comeback.
19. Slow days still count toward the total.
20. Good routines are boring on purpose.
21. Your phone can wait ten minutes. Your goals can't wait forever.
22. Water first, scrolling second.
23. Today you only need to beat yesterday's excuse.
24. Win the morning, and the afternoon gets easier.
25. Three habits done well beat ten abandoned.
26. Stack a new habit on one you already keep.
27. Plan tonight, relax tomorrow.
28. Every level starts with a first quest.
29. Even heroes begin with a single tap.
30. Your best streak is the one you're on today.
31. Be a little better than your last attempt.
32. Ordinary effort, repeated, looks like talent from far away.

Swahili proverbs, shown with the English line underneath in smaller text:

| Swahili                     | English                                   |
| --------------------------- | ----------------------------------------- |
| Haba na haba hujaza kibaba. | Little by little fills the measure.       |
| Polepole ndio mwendo.       | Slowly is the way to go.                  |
| Mwenye subira hula mbivu.   | The patient one eats ripe fruit.          |
| Penye nia pana njia.        | Where there is a will, there is a way.    |
| Ukiona vyaelea, vimeundwa.  | What you see afloat was built.            |
| Bandu bandu huisha gogo.    | Chip by chip, the log is finished.        |
| Subira huvuta heri.         | Patience draws good fortune.              |
| Mwanzo wa ngoma ni lele.    | Every big dance starts with a small step. |
