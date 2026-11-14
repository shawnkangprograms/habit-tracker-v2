// C4 Set 1: every award rule (utils/awards.ts) at its boundary, as written in docs/HABITQUEST_DESIGN.md (C4, "The
// rules"). Each fixture is built from habits and completions only, the two synced tables the awards may read.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below

const awards = await import('../utils/awards.ts');
const gami = await import('../utils/gamification.ts');

type Habit = import('../utils/radar/score.ts').RadarHabit;
type Completion = import('../utils/gamification.ts').GamiCompletion;
type WeekdayKey = import('../constants/habits.ts').WeekdayKey;

const TODAY = '2026-11-15';// a Sunday
const T = gami.toDayNumber(TODAY);
const day = (offset: number) => gami.fromDayNumber(T + offset);// day(0) is today, day(-1) yesterday

const habit = (habitId: string, createdDate: string, opts: {days?: WeekdayKey[]; deleted?: boolean; icon?: string} = {}): Habit => ({
  habitId, createdDate, frequencyType: opts.days ? 'weekdays' : 'daily', days: opts.days ?? [], deleted: opts.deleted ?? false,
  icon: opts.icon ?? 'book',
});
const tick = (habitId: string, date: string, completed = true): Completion => ({habitId, date, completed});
// ticks for one habit on each of the given day offsets
const ticks = (habitId: string, offsets: number[]) => offsets.map((o) => tick(habitId, day(o)));
const span = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => from + i);

function award(id: string, habits: Habit[], completions: Completion[], today = TODAY) {
  const state = awards.computeAwards(habits, completions, today).find((s) => s.id === id);
  assert.ok(state, id);
  return state;
}
const earned = (id: string, habits: Habit[], completions: Completion[], today = TODAY) => award(id, habits, completions, today).earned;

describe('streaks: the longest overall streak (computeStreaks, unchanged)', () => {
  test('3 days in a row earns streak_3; 2 do not; remaining counts down', () => {
    const h = [habit('a', day(-10))];
    assert.equal(earned('streak_3', h, ticks('a', [-1, 0])), false);
    assert.equal(award('streak_3', h, ticks('a', [-1, 0])).remaining, 1);
    assert.equal(earned('streak_3', h, ticks('a', [-2, -1, 0])), true);
    assert.equal(award('streak_3', h, ticks('a', [-2, -1, 0])).remaining, 0);
  });

  test('streak_200 at 200, not 199 (the new ones read the same longest streak)', () => {
    const h = [habit('a', day(-300))];
    assert.equal(earned('streak_200', h, ticks('a', span(-198, 0))), false);
    assert.equal(earned('streak_200', h, ticks('a', span(-199, 0))), true);
    assert.equal(earned('streak_365', h, ticks('a', span(-364, 0))), true);
  });

  test('the six medals agree with earnedBadges for any history', () => {
    const h = [habit('a', day(-120))];
    for (const len of [0, 2, 3, 7, 13, 14, 30, 59, 60, 100]) {
      const c = ticks('a', span(-len + 1, 0)).slice(0, len);
      const badges = gami.computeGamification(h, c, TODAY).badges;
      for (const days of [3, 7, 14, 30, 60, 100]) assert.equal(earned(`streak_${days}`, h, c), badges.includes(days), `${len}: ${days}`);
    }
  });
});

describe('perfect days: at least one scheduled habit, every scheduled habit ticked', () => {
  test('one habit ticked today: perfect_1', () => {
    assert.equal(earned('perfect_1', [habit('a', day(-3))], ticks('a', [0])), true);
  });

  test('two scheduled and one ticked is not perfect', () => {
    assert.equal(earned('perfect_1', [habit('a', day(-3)), habit('b', day(-3))], ticks('a', [0, -1])), false);
  });

  test('a day with nothing scheduled is never perfect, even with a tick (a deleted habit\'s)', () => {
    const h = [habit('gone', day(-5), {deleted: true})];
    assert.equal(earned('perfect_1', h, ticks('gone', [-2, -1, 0])), false);
  });

  test('perfect_7 at 7, not 6', () => {
    const h = [habit('a', day(-20))];
    assert.equal(earned('perfect_7', h, ticks('a', [-10, -8, -6, -4, -2, 0])), false);
    assert.equal(earned('perfect_7', h, ticks('a', [-12, -10, -8, -6, -4, -2, 0])), true);
  });
});

describe('perfect runs', () => {
  test('3 perfect days in a row; a missed one between breaks the run', () => {
    const h = [habit('a', day(-10))];
    assert.equal(earned('perfect_run_3', h, ticks('a', [-2, -1, 0])), true);
    assert.equal(earned('perfect_run_3', h, ticks('a', [-4, -3, -1, 0])), false);
    assert.equal(award('perfect_run_3', h, ticks('a', [-4, -3, -1, 0])).remaining, 1);
  });

  test('today unticked does not break the run; ticked, it adds', () => {
    const h = [habit('a', day(-10))];
    assert.equal(earned('perfect_run_3', h, ticks('a', [-2, -1])), false);
    assert.equal(award('perfect_run_3', h, ticks('a', [-2, -1])).remaining, 1);
    assert.equal(earned('perfect_run_3', h, ticks('a', [-2, -1, 0])), true);
  });

  test('dates with nothing scheduled are skipped: a weekday habit\'s perfect week runs across the weekend', () => {
    const weekdays: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const h = [habit('a', day(-30), {days: weekdays})];
    // today is Sunday: day(-2) Fri ... day(-13) Mon; the scheduled dates from day(-9) (Wed) to day(-2) (Fri)
    const scheduled = span(-9, -2).filter((o) => weekdays.includes(gami.weekdayOf(T + o)));
    assert.equal(scheduled.length, 6);
    assert.equal(earned('perfect_run_7', h, ticks('a', scheduled)), false);
    const seven = span(-10, -2).filter((o) => weekdays.includes(gami.weekdayOf(T + o)));
    assert.equal(seven.length, 7);
    assert.equal(earned('perfect_run_7', h, ticks('a', seven)), true);
  });
});

describe('volume: ticks in total', () => {
  test('10 earns done_10, 9 does not; un-ticked and future rows don\'t count', () => {
    const h = [habit('a', day(-30))];
    const nine = ticks('a', span(-8, 0));
    assert.equal(earned('done_10', h, nine), false);
    assert.equal(award('done_10', h, nine).remaining, 1);
    assert.equal(earned('done_10', h, [...nine, tick('a', day(-20), false), tick('a', day(1))]), false);
    assert.equal(earned('done_10', h, [...nine, tick('a', day(-20))]), true);
  });

  test('a deleted habit\'s ticks still count', () => {
    const h = [habit('a', day(-30)), habit('gone', day(-30), {deleted: true})];
    assert.equal(earned('done_10', h, [...ticks('a', span(-4, 0)), ...ticks('gone', span(-9, -5))]), true);
  });
});

describe('steady week and steady month', () => {
  test('one habit, 7 dates: 6 ticked (86%) earns; 5 (71%) does not', () => {
    const h = [habit('a', day(-6))];
    assert.equal(earned('steady_week', h, ticks('a', [-6, -5, -4, -3, -2, -1])), true);
    assert.equal(earned('steady_week', h, ticks('a', [-6, -5, -4, -3, -2])), false);
  });

  test('exactly 80% earns, just under does not (5 habits x 7 dates: 28 of 35, 27 of 35)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const h = ids.map((id) => habit(id, day(-6)));
    const all = ids.flatMap((id) => ticks(id, span(-6, 0)));
    assert.equal(earned('steady_week', h, all.slice(0, 28)), true);
    assert.equal(earned('steady_week', h, all.slice(0, 27)), false);
  });

  test('the window starts on or after the first created date: 3 perfect dates are not a steady week', () => {
    const h = [habit('a', day(-2)), habit('b', day(-2)), habit('c', day(-2))];
    assert.equal(earned('steady_week', h, ['a', 'b', 'c'].flatMap((id) => ticks(id, [-2, -1, 0]))), false);
  });

  test('at least 7 scheduled habit-days: a habit on one weekday a week can\'t make a steady week', () => {
    const h = [habit('a', day(-13), {days: ['sun']})];
    assert.equal(earned('steady_week', h, ticks('a', [-7, 0])), false);
  });

  test('ticks on unscheduled dates and on deleted habits do not count', () => {
    const h = [habit('a', day(-6), {days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']}), habit('gone', day(-6), {deleted: true})];
    // 6 scheduled dates in the window: below the 7 needed, however many other ticks there are
    assert.equal(earned('steady_week', h, [...ticks('a', span(-6, 0)), ...ticks('gone', span(-6, 0))]), false);
  });

  test('steady month: 24 of 30 (80%) earns, 23 does not; 29 dates of history are too few', () => {
    const h = [habit('a', day(-29))];
    const hits = span(-29, 0);
    assert.equal(earned('steady_month', h, ticks('a', hits.slice(0, 24))), true);
    assert.equal(earned('steady_month', h, ticks('a', hits.slice(0, 23))), false);
    assert.equal(earned('steady_month', [habit('a', day(-28))], ticks('a', span(-28, 0))), false);
  });

  test('today may close the window; its unticked habits count as not ticked', () => {
    const h = [habit('a', day(-6))];
    assert.equal(earned('steady_week', h, ticks('a', span(-6, -1))), true);// 6 of 7, today open
  });
});

describe('never twice', () => {
  test('30 daily dates, every other one missed: earned (no two missed in a row)', () => {
    const h = [habit('a', day(-29))];
    assert.equal(earned('never_twice', h, ticks('a', span(-29, 0).filter((o) => o % 2 === 0))), true);
  });

  test('two missed dates back to back inside the window: not earned', () => {
    const h = [habit('a', day(-29))];
    assert.equal(earned('never_twice', h, ticks('a', span(-29, 0).filter((o) => o !== -10 && o !== -11))), false);
  });

  test('29 dates of history are too few', () => {
    assert.equal(earned('never_twice', [habit('a', day(-28))], ticks('a', span(-28, 0))), false);
  });

  test('a weekday habit missed on Friday and Monday: the weekend between is not missed, so it is earned', () => {
    const weekdays: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const h = [habit('a', day(-29), {days: weekdays})];
    const scheduled = span(-29, 0).filter((o) => weekdays.includes(gami.weekdayOf(T + o)));
    const friday = scheduled.find((o) => gami.weekdayOf(T + o) === 'fri' && scheduled.includes(o + 3))!;
    assert.ok(scheduled.length >= 20);
    assert.equal(earned('never_twice', h, ticks('a', scheduled.filter((o) => o !== friday && o !== friday + 3))), true);
  });

  test('fewer than 20 dates with something scheduled: not earned', () => {
    const h = [habit('a', day(-29), {days: ['mon', 'wed', 'fri']})];
    assert.equal(earned('never_twice', h, ticks('a', span(-29, 0))), false);
  });

  test('yesterday missed and today still open is not two in a row (the only window ends today)', () => {
    const h = [habit('a', day(-29))];
    // 30 dates of history, so the one window is -29..0; misses at -1 and every third date before it
    const hits = span(-29, -2).filter((o) => o % 3 !== 0);
    assert.equal(earned('never_twice', h, ticks('a', hits)), true);
  });

  test('a date with some of its habits ticked is not missed', () => {
    const h = [habit('a', day(-29)), habit('b', day(-29))];
    // 'a' every date, 'b' never: no date is missed (not one is perfect either)
    assert.equal(earned('never_twice', h, ticks('a', span(-29, 0))), true);
  });

  test('today unticked is not a missed date', () => {
    const h = [habit('a', day(-29))];
    const alternate = span(-29, -1).filter((o) => o % 2 !== 0);// misses -2, -4 ...; -1 ticked; today open
    assert.equal(earned('never_twice', h, ticks('a', alternate)), true);
  });
});

describe('weekend done', () => {
  const sat = -1;// today (2026-11-15) is a Sunday
  test('a Saturday and the Sunday after, both perfect', () => {
    assert.equal(gami.weekdayOf(T + sat), 'sat');
    assert.equal(earned('weekend_done', [habit('a', day(-10))], ticks('a', [sat, 0])), true);
  });

  test('Sunday and Monday is not a weekend; one perfect day of the two is not enough', () => {
    assert.equal(earned('weekend_done', [habit('a', day(-10))], ticks('a', [-7, -6])), false);// Sun, Mon
    assert.equal(earned('weekend_done', [habit('a', day(-10))], ticks('a', [sat])), false);
  });

  test('a Saturday-only habit: Sunday has nothing scheduled, so it is not perfect', () => {
    assert.equal(earned('weekend_done', [habit('a', day(-10), {days: ['sat']})], ticks('a', [sat, 0])), false);
  });
});

describe('back again', () => {
  test('a tick 4 days after the previous one (3 empty dates between) earns; 3 days after does not', () => {
    const h = [habit('a', day(-20))];
    assert.equal(earned('comeback', h, ticks('a', [-4, 0])), true);
    assert.equal(earned('comeback', h, ticks('a', [-3, 0])), false);
  });

  test('a first-ever tick is not a comeback, however long the account waited', () => {
    assert.equal(earned('comeback', [habit('a', day(-40))], ticks('a', [0])), false);
  });

  test('the earlier tick may be on a deleted habit', () => {
    const h = [habit('a', day(-20)), habit('gone', day(-20), {deleted: true})];
    assert.equal(earned('comeback', h, [tick('gone', day(-9)), tick('a', day(0))]), true);
  });
});

describe('one habit (mastery)', () => {
  test('7 in a row on one habit earns; 6 do not; another habit\'s ticks don\'t join the run', () => {
    const h = [habit('a', day(-20)), habit('b', day(-20))];
    assert.equal(earned('habit_streak_7', h, ticks('a', span(-6, 0))), true);
    assert.equal(earned('habit_streak_7', h, ticks('a', span(-5, 0))), false);
    assert.equal(earned('habit_streak_7', h, [...ticks('a', span(-6, -3)), ...ticks('b', span(-2, 0))]), false);
  });

  test('its own schedule: a weekday habit\'s run crosses the weekend', () => {
    const weekdays: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const h = [habit('a', day(-30), {days: weekdays})];
    const seven = span(-10, -2).filter((o) => weekdays.includes(gami.weekdayOf(T + o)));
    assert.equal(earned('habit_streak_7', h, ticks('a', seven)), true);
  });

  test('deleting the habit takes it away', () => {
    assert.equal(earned('habit_streak_7', [habit('a', day(-20), {deleted: true})], ticks('a', span(-6, 0))), false);
  });
});

describe('variety', () => {
  test('five active habits earn habits_5; four and a deleted one do not', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => habit(id, day(-3)));
    assert.equal(earned('habits_5', five, []), true);
    assert.equal(earned('habits_5', [...five.slice(0, 4), habit('e', day(-3), {deleted: true})], []), false);
  });

  test('areas through the icon-to-area table: book, run and work cover three', () => {
    const h = [habit('a', day(-3), {icon: 'book'}), habit('b', day(-3), {icon: 'run'}), habit('c', day(-3), {icon: 'work'})];
    assert.equal(earned('areas_3', h, []), true);
  });

  test('General icons and unknown icons count toward no area', () => {
    const h = [habit('a', day(-3), {icon: 'book'}), habit('b', day(-3), {icon: 'run'}), habit('c', day(-3), {icon: 'star'}),
      habit('d', day(-3), {icon: 'trophy'}), habit('e', day(-3), {icon: 'zz_test_unknown'})];
    assert.equal(earned('areas_3', h, []), false);
    assert.equal(award('areas_3', h, []).remaining, 1);
  });

  test('a deleted habit\'s area does not count; two icons in one area count once', () => {
    const h = [habit('a', day(-3), {icon: 'book'}), habit('b', day(-3), {icon: 'study'}), habit('c', day(-3), {icon: 'run'}),
      habit('d', day(-3), {icon: 'work', deleted: true})];
    assert.equal(earned('areas_3', h, []), false);
  });

  test('all six areas', () => {
    const icons = ['run', 'meditate', 'checklist', 'work', 'book', 'heart'];
    assert.equal(earned('areas_6', icons.map((icon, i) => habit(`h${i}`, day(-3), {icon})), []), true);
    assert.equal(earned('areas_6', icons.slice(0, 5).map((icon, i) => habit(`h${i}`, day(-3), {icon})), []), false);
  });
});

describe('time', () => {
  test('7 days from the first created date, with a tick, earns days_7; 6 days do not', () => {
    assert.equal(earned('days_7', [habit('a', day(-7))], ticks('a', [0])), true);
    assert.equal(earned('days_7', [habit('a', day(-6))], ticks('a', [0])), false);
    assert.equal(award('days_7', [habit('a', day(-6))], ticks('a', [0])).remaining, 1);
  });

  test('no tick yet: not earned, and no count to show', () => {
    const state = award('days_30', [habit('a', day(-40))], []);
    assert.deepEqual({earned: state.earned, remaining: state.remaining}, {earned: false, remaining: null});
  });

  test('the earliest created date counts even when that habit was deleted', () => {
    const h = [habit('old', day(-30), {deleted: true}), habit('a', day(-2))];
    assert.equal(earned('days_30', h, ticks('a', [0])), true);
  });
});

describe('edges', () => {
  test('an empty account earns nothing and does not throw', () => {
    assert.ok(awards.computeAwards([], [], TODAY).every((s) => !s.earned));
  });

  test('S-2: a habit created while the clock was ahead counts from today only', () => {
    const h = [habit('a', day(5))];
    assert.equal(earned('perfect_1', h, ticks('a', [0])), true);
    assert.equal(earned('days_7', h, ticks('a', [0])), false);
  });

  test('a bad today throws, like the rest of the stats', () => {
    assert.throws(() => awards.computeAwards([], [], '15/11/2026'));
  });

  test('one state per award, in table order', () => {
    assert.deepEqual(awards.computeAwards([], [], TODAY).map((s) => s.id), awards.AWARDS.map((a) => a.id));
  });
});
