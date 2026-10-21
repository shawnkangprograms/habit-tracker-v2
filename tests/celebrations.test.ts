// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {GamificationStats} from '../utils/gamification.ts';
import type {Celebration, QueueItem, TickDiff} from '../utils/celebrations.ts';

const c = await import('../utils/celebrations.ts');
const {computeGamification, levelFromXp} = await import('../utils/gamification.ts');

const TODAY = '2026-10-21';
const BASE = computeGamification([], [], TODAY);

// Stats with just the fields the tick logic reads; level fields follow totalXp like the engine
function stats(over: Partial<GamificationStats> & {totalXp?: number} = {}): GamificationStats {
  const totalXp = over.totalXp ?? over.completionXp ?? 0;
  return {...BASE, ...levelFromXp(totalXp), ...over, totalXp};
}

function tick(before: GamificationStats, after: GamificationStats, doneToday = 1, scheduledToday = 3) {
  return c.diffTick({before, after, doneToday, scheduledToday});
}

const diffOf = (over: Partial<TickDiff>): TickDiff => ({
  levelUp: null, levelsCrossed: [], streakMilestone: null, streakMilestonesCrossed: [], perfectDay: false,
  firstHabitEver: false, firstHabitToday: false, habitsLeftToday: 0, xpToNextLevel: 100, nextLevel: 3,
  currentStreak: 1, longestStreak: 1, comeback: false, streakDay: null, ...over,
});

describe('diffTick', () => {
  test('level up: the new level and every level crossed', () => {
    const d = tick(stats({completionXp: 40, totalXp: 40}), stats({completionXp: 50, totalXp: 160}));
    assert.equal(d?.levelUp, 3);
    assert.deepEqual(d?.levelsCrossed, [2, 3]);
  });

  test('milestone: the LONGEST streak crossing 3 (and only crossings count)', () => {
    const before = stats({completionXp: 20, currentStreak: 2, longestStreak: 2, badges: []});
    const after = stats({completionXp: 30, currentStreak: 3, longestStreak: 3, badges: [3]});
    assert.equal(tick(before, after)?.streakMilestone, 3);

    // rebuilding a streak below an older longest: no new badge, no milestone
    const rebuilding = tick(
      stats({completionXp: 90, currentStreak: 2, longestStreak: 8, badges: [3, 7]}),
      stats({completionXp: 100, currentStreak: 3, longestStreak: 8, badges: [3, 7]}),
    );
    assert.equal(rebuilding?.streakMilestone, null);
  });

  test('several milestones at once: highest celebrated, all crossed listed', () => {
    const d = tick(stats({completionXp: 10, badges: []}), stats({completionXp: 20, badges: [3, 7]}));
    assert.equal(d?.streakMilestone, 7);
    assert.deepEqual(d?.streakMilestonesCrossed, [3, 7]);
  });

  test('perfect day, habits left, first ever, comeback and streak day', () => {
    const first = tick(stats(), stats({completionXp: 10, perfectDays: 1, currentStreak: 1, longestStreak: 1}), 1, 1);
    assert.equal(first?.perfectDay, true);
    assert.equal(first?.firstHabitEver, true);
    assert.equal(first?.habitsLeftToday, 0);
    assert.equal(first?.comeback, false);

    const comeback = tick(
      stats({completionXp: 50, currentStreak: 0, longestStreak: 4}),
      stats({completionXp: 60, currentStreak: 1, longestStreak: 4}),
    );
    assert.equal(comeback?.comeback, true);
    assert.equal(comeback?.streakDay, null);

    const day2 = tick(stats({completionXp: 10, currentStreak: 1}), stats({completionXp: 20, currentStreak: 2}), 1, 2);
    assert.equal(day2?.streakDay, 2);
    assert.equal(day2?.firstHabitToday, true);
    assert.equal(day2?.habitsLeftToday, 1);
  });

  test('un-tick produces nothing', () => {
    const before = stats({completionXp: 30, perfectDays: 1, currentStreak: 3, longestStreak: 3, badges: [3]});
    const after = stats({completionXp: 20, perfectDays: 0, currentStreak: 2, longestStreak: 2, badges: []});
    assert.equal(tick(before, after), null);
  });

  test('no new completion (e.g. a change that is not a tick) produces nothing', () => {
    const s = stats({completionXp: 30, totalXp: 30});
    assert.equal(tick(s, {...s, level: 5, badges: [3]}), null);
  });
});

describe('celebrations: priority, once only, highest milestone', () => {
  const big = diffOf({levelUp: 4, levelsCrossed: [4], streakMilestone: 7, streakMilestonesCrossed: [3, 7], perfectDay: true, currentStreak: 7});

  test('order: level up, then streak milestone, then perfect day', () => {
    const {celebrations, keys} = c.celebrationsFor(big, TODAY, new Set());
    assert.deepEqual(celebrations.map((x: Celebration) => x.kind), ['levelUp', 'streak', 'perfectDay']);
    assert.deepEqual(keys, ['level:4', 'streak:3', 'streak:7', `perfect:${TODAY}`]);
    assert.deepEqual(celebrations[1], {kind: 'streak', days: 7, tier: 'silver'});
  });

  test('already celebrated keys are left out (un-tick then re-tick never repeats)', () => {
    const done = new Set(['level:4', 'streak:3', 'streak:7', `perfect:${TODAY}`]);
    assert.deepEqual(c.celebrationsFor(big, TODAY, done),
      {celebrations: [], keys: [], repeats: ['repeatLevel', 'repeatMedal', 'repeatPerfect']});
  });

  test('a lower milestone already celebrated: the new highest is still celebrated', () => {
    const {celebrations, keys} = c.celebrationsFor(big, TODAY, new Set(['streak:3']));
    assert.deepEqual(celebrations.find((x: Celebration) => x.kind === 'streak'), {kind: 'streak', days: 7, tier: 'silver'});
    assert.ok(!keys.includes('streak:3'));
  });

  test('a perfect day on another date is a new celebration', () => {
    const {celebrations} = c.celebrationsFor(diffOf({perfectDay: true}), TODAY, new Set(['perfect:2026-10-20']));
    assert.deepEqual(celebrations.map((x: Celebration) => x.kind), ['perfectDay']);
  });
});

describe('repeat toasts (reached again, already celebrated)', () => {
  const ids = () => { let n = 0; return () => ++n; };

  test('re-reaching a celebrated level, medal or perfect day: a repeat toast, no overlay, nothing to mark', () => {
    const cases: [Partial<TickDiff>, string[], string, string][] = [
      [{levelUp: 3, levelsCrossed: [3]}, ['level:3'], 'repeatLevel', 'Back to level 3.'],
      [{streakMilestone: 7, streakMilestonesCrossed: [7], currentStreak: 7, longestStreak: 7}, ['streak:7'], 'repeatMedal', 'The 7-day medal is back.'],
      [{perfectDay: true}, [`perfect:${TODAY}`], 'repeatPerfect', 'Perfect day again. Every habit done.'],
    ];
    for (const [over, celebratedKeys, situation, text] of cases) {
      const diff = diffOf(over);
      const plan = c.celebrationsFor(diff, TODAY, new Set(celebratedKeys));
      assert.deepEqual(plan.celebrations, [], situation);
      assert.deepEqual(plan.keys, [], `${situation}: the celebrated store must not be written`);
      assert.equal(c.pickSituation(diff, false, plan.repeats), situation);
      const picker = c.createMessagePicker();
      const toast = picker.pick(c.pickSituation(diff, false, plan.repeats)!, c.messageVars(diff));
      assert.equal(toast, text);
      assert.deepEqual(c.tickItems(plan.celebrations, toast, c.messageVars(diff), picker, ids()).map((i: QueueItem) => i.kind), ['toast']);
    }
  });

  test('first time: still the overlay or banner, no repeat and no toast', () => {
    const diff = diffOf({levelUp: 3, levelsCrossed: [3], perfectDay: true});
    const plan = c.celebrationsFor(diff, TODAY, new Set());
    assert.deepEqual(plan.celebrations.map((x: Celebration) => x.kind), ['levelUp', 'perfectDay']);
    assert.deepEqual(plan.repeats, []);
    const items = c.tickItems(plan.celebrations, 'any toast', c.messageVars(diff), c.createMessagePicker(), ids());
    assert.deepEqual(items.map((i: QueueItem) => i.kind), ['levelUp', 'perfectDay']);
  });

  test('a first-time celebration on the same tick still suppresses a repeat toast', () => {
    const diff = diffOf({levelUp: 3, levelsCrossed: [3], streakMilestone: 7, streakMilestonesCrossed: [7]});
    const plan = c.celebrationsFor(diff, TODAY, new Set(['level:3']));
    assert.deepEqual(plan.celebrations.map((x: Celebration) => x.kind), ['streak']);
    assert.deepEqual(plan.repeats, ['repeatLevel']);
    const items = c.tickItems(plan.celebrations, 'Back to level 3.', c.messageVars(diff), c.createMessagePicker(), ids());
    assert.deepEqual(items.map((i: QueueItem) => i.kind), ['streak']);
  });

  test('precedence: repeats first (level, medal, perfect day), then early praise and the rest', () => {
    const diff = diffOf({comeback: true, habitsLeftToday: 2});
    const all = ['repeatLevel', 'repeatMedal', 'repeatPerfect'] as const;
    assert.deepEqual(c.situationsFor(diff, true, [...all]).slice(0, 5),
      ['repeatLevel', 'repeatMedal', 'repeatPerfect', 'early', 'comeback']);
    assert.equal(c.pickSituation(diff, true, ['repeatPerfect', 'repeatMedal']), 'repeatMedal');
    assert.equal(c.pickSituation(diff, true, ['repeatPerfect']), 'repeatPerfect');
    assert.equal(c.pickSituation(diff, true, []), 'early');
  });

  test('repeat wordings rotate and never show the same text twice in a row', () => {
    const picker = c.createMessagePicker();
    const vars = c.messageVars(diffOf({levelUp: 5, levelsCrossed: [5], streakMilestone: 14}));
    const seen: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 12; i++) {
      const text = picker.pick(i % 4 === 3 ? 'repeatMedal' : 'repeatLevel', vars)!;
      assert.notEqual(text, last);
      assert.ok(!text.includes('!'));
      seen.push(text);
      last = text;
    }
    assert.ok(seen.includes('Level 5 is yours again.') && seen.includes('Level 5 again. Back where you were.'));
    assert.ok(seen.includes('The 14-day medal is back.') || seen.includes('14-day medal earned again.'));
  });
});

describe('toast precedence', () => {
  test('the full order', () => {
    const everything = diffOf({
      comeback: true, firstHabitEver: true, streakDay: 4, habitsLeftToday: 1, xpToNextLevel: 20, firstHabitToday: true,
    });
    assert.deepEqual(c.situationsFor(everything, true), ['early', 'comeback', 'firstEver', 'streakDay', 'lastOne', 'nearLevel', 'firstToday']);
    assert.deepEqual(c.situationsFor(diffOf({habitsLeftToday: 3, xpToNextLevel: 30}), false), ['nearLevel', 'progress']);
  });

  test('highest applicable wins; nothing applicable gives no toast', () => {
    assert.equal(c.pickSituation(diffOf({streakDay: 3, habitsLeftToday: 2}), false), 'streakDay');
    assert.equal(c.pickSituation(diffOf({streakDay: 3}), true), 'early');
    assert.equal(c.pickSituation(diffOf({habitsLeftToday: 2, xpToNextLevel: 31}), false), 'progress');
    assert.equal(c.pickSituation(diffOf({}), false), null);
  });
});

describe('message picker', () => {
  test('never the same text twice in a row, across 50 picks and mixed keys', () => {
    const picker = c.createMessagePicker();
    const vars = c.messageVars(diffOf({habitsLeftToday: 2}));
    let last: string | null = null;
    for (let i = 0; i < 50; i++) {
      const text = picker.pick(i % 7 === 0 ? 'lastOne' : 'progress', vars);
      assert.notEqual(text, last);
      last = text;
    }
  });

  test('wordings rotate in a fixed order (deterministic)', () => {
    const vars = c.messageVars(diffOf({habitsLeftToday: 2}));
    const a = c.createMessagePicker();
    const b = c.createMessagePicker();
    for (let i = 0; i < 6; i++) assert.equal(a.pick('progress', vars), b.pick('progress', vars));
  });

  test('placeholders filled; streak-day wording depends on the next medal', () => {
    const picker = c.createMessagePicker();
    const day2 = c.messageVars(diffOf({streakDay: 2, currentStreak: 2, longestStreak: 2}));
    assert.equal(picker.pick('streakDay', day2), "Day 2. Keep it going and you'll earn your first medal at 3 days.");
    assert.equal(picker.pick('streakDay', day2), 'Day 2 of your streak. 1 more for the 3-day medal.');
    assert.equal(picker.pick('streakDay', day2), '2 days in a row. The 3-day medal is one day away.');

    const allEarned = c.messageVars(diffOf({streakDay: 120, currentStreak: 120, longestStreak: 120}));
    assert.equal(c.createMessagePicker().pick('streakDay', allEarned), 'Day 120 in a row. Steady.');
    assert.equal(c.createMessagePicker().pick('nearLevel', c.messageVars(diffOf({xpToNextLevel: 20, nextLevel: 3}))), 'Only 20 XP to level 3.');
  });

  test('perfect-day banner: plain under a 2-day streak, streak-aware from 2', () => {
    const plain = c.createMessagePicker().pick('perfectDay', c.messageVars(diffOf({currentStreak: 1})));
    assert.equal(plain, 'Perfect day. Every habit done.');
    const p = c.createMessagePicker();
    const vars = c.messageVars(diffOf({currentStreak: 5}));
    assert.equal(p.pick('perfectDay', vars), 'Perfect day. Day 5 in a row.');
    assert.equal(p.pick('perfectDay', vars), 'Perfect day, +20 XP. Day 5 of your streak.');
  });

  test('copy changes are in', () => {
    assert.ok(c.MESSAGE_BANK.firstToday.some((v) => v(c.messageVars(diffOf({}))) === 'Today is underway.'));
    assert.ok(c.MESSAGE_BANK.progress.some((v) => v(c.messageVars(diffOf({habitsLeftToday: 3}))) === 'Good progress. 3 habits left today.'));
    const all = Object.values(c.MESSAGE_BANK).flat().map((v) => v(c.messageVars(diffOf({currentStreak: 5, streakDay: 5}))));
    assert.ok(all.every((t) => t === null || !t.includes('!')), 'no exclamation marks');
  });
});

describe('queue', () => {
  const ids = () => { let n = 0; return () => ++n; };

  test('a celebration suppresses the toast of the same tick', () => {
    const picker = c.createMessagePicker();
    const vars = c.messageVars(diffOf({currentStreak: 3}));
    const items = c.tickItems([{kind: 'perfectDay', currentStreak: 3}], 'Nice. 2 left for today.', vars, picker, ids());
    assert.deepEqual(items.map((i: QueueItem) => i.kind), ['perfectDay']);
    assert.deepEqual(c.tickItems([], 'Nice. 2 left for today.', vars, picker, ids()).map((i: QueueItem) => i.kind), ['toast']);
    assert.deepEqual(c.tickItems([], null, vars, picker, ids()), []);
  });

  test('overlay items carry titles; one at a time, FIFO across ticks', () => {
    const picker = c.createMessagePicker();
    const next = ids();
    const vars = c.messageVars(diffOf({}));
    const first = c.tickItems([{kind: 'levelUp', level: 4}, {kind: 'streak', days: 7, tier: 'silver'}], null, vars, picker, next);
    assert.deepEqual(first.map((i: QueueItem) => ('title' in i ? i.title : '')), ['Level 4', '7-day streak']);
    let queue = c.enqueue([], first);
    queue = c.enqueue(queue, c.tickItems([], 'One more for a perfect day.', vars, picker, next));
    assert.deepEqual(queue.map((i: QueueItem) => i.kind), ['levelUp', 'streak', 'toast']);

    assert.equal(c.dismissItem(queue, queue[1].id), queue);// only the item showing can be dismissed
    queue = c.dismissItem(queue, queue[0].id);
    assert.equal(queue[0].kind, 'streak');
    assert.deepEqual(c.dropToasts(queue).map((i: QueueItem) => i.kind), ['streak']);
  });

  const toast = (id: number, text: string): QueueItem => ({id, kind: 'toast', text});
  const banner = (id: number): QueueItem => ({id, kind: 'perfectDay', text: 'Perfect day. Every habit done.'});

  test('a new toast replaces the toast that is showing, at once', () => {
    const queue = c.enqueue(c.enqueue([], [toast(1, 'first')]), [toast(2, 'second')]);
    assert.deepEqual(queue, [toast(2, 'second')]);
  });

  test('a new toast clears waiting toasts but stays behind celebrations, which keep their order', () => {
    let queue = c.enqueue([], [banner(1)]);
    queue = c.enqueue(queue, [toast(2, 'older')]);
    queue = c.enqueue(queue, [toast(3, 'newer')]);
    assert.deepEqual(queue.map((i: QueueItem) => i.id), [1, 3]);

    queue = c.enqueue(queue, [banner(4)]);// a newer tick's celebration: the older toast is dropped
    assert.deepEqual(queue.map((i: QueueItem) => i.id), [1, 4]);
  });

  test('nothing new: the queue is left as it is', () => {
    const queue = [toast(1, 'still showing')];
    assert.equal(c.enqueue(queue, []), queue);
  });
});
