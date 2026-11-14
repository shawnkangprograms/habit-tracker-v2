// R-3 (docs/BUG_LOG.md, docs/PACKS_REPORTS_SPEC.md section 16): the reflection bar's time counts only while no
// level-up or streak overlay covers it; uncovered, it gets its full 8 s (20 s with a screen reader) again, and its
// announcement waits until it is first uncovered. The timer runs on a fake clock here (utils/reflections/barTimer.ts).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below

const {createBarTimer} = await import('../utils/reflections/barTimer.ts');
const {barDuration, BAR_MS, BAR_MS_SCREEN_READER, forDay, withoutHabit} = await import('../utils/reflections/bar.ts');
const C = await import('../utils/celebrations.ts');

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// A fake clock: timers fire when time is advanced past them
function clock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, {at: number; fn: () => void}>();
  return {
    now: () => now,
    pending: () => timers.size,
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(++nextId, {at: now + ms, fn});
      return nextId;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
    to(t: number) {
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = t;
    },
  };
}

// One bar: when it expired and when it was announced (ms on the fake clock)
function bar() {
  const c = clock();
  const events: {expiredAt: number | null; announcedAt: number[]} = {expiredAt: null, announcedAt: []};
  const timer = createBarTimer({
    setTimeout: c.setTimeout,
    clearTimeout: c.clearTimeout,
    onExpire: () => { events.expiredAt = c.now(); },
    announce: () => { events.announcedAt.push(c.now()); },
  });
  return {c, timer, events};
}

describe('R-3: the bar\'s time counts only while it is uncovered', () => {
  test('R3-1: uncovered from the start: announced at once, gone after 8 s', () => {
    const {c, timer, events} = bar();
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(7_999);
    assert.equal(events.expiredAt, null);
    c.to(9_000);
    assert.deepEqual([events.expiredAt, events.announcedAt], [8_000, [0]]);
  });

  test('R3-2: an overlay that outlasts the timer: shown at 2 s, dismissed at 30 s; the bar goes 8 s after Continue', () => {
    const {c, timer, events} = bar();
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(2_000);
    timer.update({covered: true, durationMs: BAR_MS});// the level-up overlay
    c.to(30_000);
    assert.equal(events.expiredAt, null, 'still there under the overlay, well past 8 s');
    timer.update({covered: false, durationMs: BAR_MS});// Continue
    c.to(37_999);
    assert.equal(events.expiredAt, null);
    c.to(40_000);
    assert.equal(events.expiredAt, 38_000);
    assert.deepEqual(events.announcedAt, [0], 'announced once');
  });

  test('R3-3: already covered when it mounts: no timer and no announcement until uncovered', () => {
    const {c, timer, events} = bar();
    timer.update({covered: true, durationMs: BAR_MS});
    c.to(20_000);
    assert.deepEqual([events.expiredAt, events.announcedAt, c.pending()], [null, [], 0]);
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(30_000);
    assert.deepEqual([events.announcedAt, events.expiredAt], [[20_000], 28_000]);
  });

  test('R3-4: two overlays back to back (a level-up, then a streak): paused across both', () => {
    const {c, timer, events} = bar();
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(1_000);
    timer.update({covered: true, durationMs: BAR_MS});// level-up
    c.to(4_000);
    timer.update({covered: true, durationMs: BAR_MS});// Continue: the streak overlay is next in the queue
    c.to(10_000);
    assert.equal(events.expiredAt, null);
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(30_000);
    assert.equal(events.expiredAt, 18_000);
  });

  test('R3-5: a newer bar replaces a paused one: the old timer never fires; the new one has its own', () => {
    const old = bar();
    old.timer.update({covered: false, durationMs: BAR_MS});
    old.c.to(1_000);
    old.timer.update({covered: true, durationMs: BAR_MS});
    old.timer.dispose();// unmounted: the next bar has another key
    old.timer.update({covered: false, durationMs: BAR_MS});// a late update after unmount does nothing
    old.c.to(60_000);
    assert.equal(old.events.expiredAt, null);
    assert.equal(old.c.pending(), 0);
    assert.match(source('app/(tabs)/index.tsx'), /<ReflectionBar\s+key=\{reflection\.bar\.id\}/);
    assert.match(source('components/reflections/reflection-bar.tsx'), /useEffect\(\(\) => \(\) => timer\.dispose\(\), \[timer\]\);/);
  });

  test('R3-6: an un-tick, Home losing focus or the day changing while paused remove the bar (no expiry after)', () => {
    const b = {id: 1, habitId: 'a', habitName: 'Read', date: '2026-11-14'};
    assert.equal(withoutHabit(b, 'a'), null);
    assert.equal(forDay(b, '2026-11-15'), null);
    assert.match(source('hooks/use-reflection-bar.ts'), /return \(\) => \{\s*focused\.current = false;\s*setBar\(null\);/);
    // the bar unmounts, so its timer is disposed while still paused
    const {c, timer, events} = bar();
    timer.update({covered: true, durationMs: BAR_MS});
    timer.dispose();
    c.to(60_000);
    assert.deepEqual([events.expiredAt, events.announcedAt], [null, []]);
  });

  test('R3-7: only the level-up and streak overlay pause it; a toast or the perfect-day banner doesn\'t', () => {
    const item = (kind: string) => ({id: 1, kind, title: 't', body: 'b', level: 2, days: 7, tier: 'bronze', text: 'x'}) as never;
    assert.equal(C.coversBar(item('levelUp')), true);
    assert.equal(C.coversBar(item('streak')), true);
    assert.equal(C.coversBar(item('toast')), false);
    assert.equal(C.coversBar(item('perfectDay')), false);
    assert.equal(C.coversBar(null), false);
    assert.match(source('app/(tabs)/index.tsx'), /covered=\{coversBar\(celebration\.current\)\}/);
  });

  test('R3-8: celebrations off, or held by S-4: no overlay, so the bar never pauses', () => {
    // off: the queue shows nothing (current is null)
    assert.match(source('hooks/use-celebrations.ts'), /const current = focused && enabled \? queue\[0\] \?\? null : null;/);
    assert.equal(C.coversBar(null), false);
    // held: no celebration is queued, only an ordinary toast at most
    const diff = {levelUp: 4, levelsCrossed: [4], streakMilestone: 7, streakMilestonesCrossed: [7], perfectDay: false, currentStreak: 7} as never;
    const held = C.celebrationsOrHeld(diff, '2026-11-14', null);
    const items = C.tickItems(held.celebrations, 'Nice one.', {} as never, C.createMessagePicker(), (() => { let n = 0; return () => ++n; })());
    assert.equal(items.some((i) => C.coversBar(i)), false);
  });

  test('R3-9: with a screen reader on: 20 s, and a full 20 s again after an overlay', () => {
    assert.deepEqual([barDuration(true), barDuration(false)], [BAR_MS_SCREEN_READER, BAR_MS]);
    const {c, timer, events} = bar();
    timer.update({covered: false, durationMs: barDuration(true)});
    c.to(5_000);
    timer.update({covered: true, durationMs: barDuration(true)});
    c.to(9_000);
    timer.update({covered: false, durationMs: barDuration(true)});
    c.to(28_999);
    assert.equal(events.expiredAt, null);
    c.to(40_000);
    assert.equal(events.expiredAt, 29_000);
  });

  test('nothing runs until the screen-reader check answers; the announcement is made by the timer, not at mount', () => {
    const {c, timer, events} = bar();
    timer.update({covered: false, durationMs: null});
    c.to(10_000);
    assert.deepEqual([events.expiredAt, events.announcedAt, c.pending()], [null, [], 0]);
    timer.update({covered: false, durationMs: BAR_MS});
    c.to(30_000);
    assert.deepEqual([events.announcedAt, events.expiredAt], [[10_000], 18_000]);
    const component = source('components/reflections/reflection-bar.tsx');
    assert.match(component, /timer\.update\(\{covered, durationMs\}\);/);
    assert.equal(component.match(/announceForAccessibility\(/g)?.length, 1);
    assert.match(component, /announce: \(\) => AccessibilityInfo\.announceForAccessibility\(barAnnouncement\(bar\.habitName\)\),/);
  });
});
