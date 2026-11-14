// R-2 (docs/BUG_LOG.md, docs/PACKS_REPORTS_SPEC.md section 16): a tick whose list load is overtaken by a newer load
// still gets its reflection offer, its celebrations and its toast; the newest tap wins whatever order things finish
// in; an un-tick drops its habit's offer; an offer that resolves after Home lost focus, or after midnight, is dropped.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import {kvStorage} from './helpers/kv-storage.ts';
import type {ReflectionsRecord} from '../utils/reflections/record.ts';

const {createOfferQueue} = await import('../utils/reflections/offers.ts');
const R = await import('../utils/reflections/record.ts');
const {createReflectionsStore} = await import('../services/reflectionsStoreCore.ts');
const {createTickOrder} = await import('../utils/celebrations.ts');

const DAY = '2026-11-14';
const ANSWERS = {feel: 'ok', amount: 'all', helped: 'routine', blocker: 'none'} as const;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const rowsTicked = (...ids: string[]) => ids.map((habitId) => ({habitId, completed: 1}));
const habit = (habitId: string) => ({habitId, habitName: `Habit ${habitId}`});

// A queue whose reads resolve when the test says so
function harness(options: {record?: ReflectionsRecord} = {}) {
  const shown: string[] = [];
  let cleared = 0;
  const pending: {resolve: (r: ReflectionsRecord) => void; reject: (e: Error) => void}[] = [];
  const state = {focused: true, today: DAY, deferred: false};
  const queue = createOfferQueue({
    read: () => (state.deferred
      ? new Promise<ReflectionsRecord>((resolve, reject) => { pending.push({resolve, reject}); })
      : Promise.resolve(options.record ?? R.emptyRecord())),
    show: (o) => { shown.push(o.habitId); },
    clear: () => { cleared += 1; },
    isFocused: () => state.focused,
    today: () => state.today,
  });
  return {queue, shown, cleared: () => cleared, pending, state};
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('R-2: every tick gets its offer, in tap order', () => {
  test('R2-1: a tick whose list load was overtaken still offers (Home passes the rows it read)', async () => {
    const h = harness();
    await h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    assert.deepEqual(h.shown, ['a']);
    const home = source('app/(tabs)/index.tsx');
    assert.match(home, /if \(request !== habitsRequest\.current\) return rows;/);
    assert.match(home, /if \(completing && saved && rows\) void offerReflection\(habit, tapDay, rows, tap\);/);
  });

  test('R2-2: the tick\'s celebrations and toast are no longer lost either: onTick gets the rows and the tap', () => {
    const home = source('app/(tabs)/index.tsx');
    assert.match(home, /const tap = \+\+tapCount\.current;/);
    assert.match(home, /if \(completing && statsDone && rows\) onTick\(\{habitId: habit\.habitId, tickedAt, rows, stats: statsDone, tap\}\);/);
    assert.match(home, /else reflectionUntick\(habit\.habitId, tap\);/);
    const hook = source('hooks/use-celebrations.ts');
    assert.match(hook, /order\.start\(tick\.tap\);/);
    assert.match(hook, /const isLatest = \(\) => order\.isLatest\(tick\.tap\);/);
    assert.match(hook, /order\.reflection\(\);/);
  });

  test('R2-3: two quick ticks: the newest tap\'s bar wins when the older tap\'s offer starts last', async () => {
    const h = harness();
    await h.queue.offer(habit('b'), DAY, rowsTicked('a', 'b'), 2);
    await h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);// its load finished last
    assert.deepEqual(h.shown, ['b']);
  });

  test('R2-3: ... and when the older tap\'s read finishes last', async () => {
    const h = harness();
    h.state.deferred = true;
    const a = h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    const b = h.queue.offer(habit('b'), DAY, rowsTicked('a', 'b'), 2);
    h.pending[1].resolve(R.emptyRecord());
    await b;
    h.pending[0].resolve(R.emptyRecord());
    await a;
    assert.deepEqual(h.shown, ['b']);
  });

  test('R2-4: an un-tick drops its habit\'s offer, while reading or before it starts; another habit\'s offer stays', async () => {
    const h = harness();
    h.state.deferred = true;
    const reading = h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    h.queue.untick('a', 2);
    h.pending[0].resolve(R.emptyRecord());
    await reading;
    assert.deepEqual(h.shown, []);
    // the tick's load finished only after the un-tick
    const late = harness();
    late.queue.untick('a', 2);
    await late.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    assert.deepEqual(late.shown, []);
    // un-ticking b doesn't touch a's offer; ticking a again later (a newer tap) is offered
    const other = harness();
    other.queue.untick('b', 1);
    await other.queue.offer(habit('a'), DAY, rowsTicked('a'), 2);
    await other.queue.offer(habit('a'), DAY, rowsTicked('a'), 4);
    assert.deepEqual(other.shown, ['a', 'a']);
  });

  test('R2-5 (F-1): reflections that can\'t be read: no bar, and an older bar is cleared', async () => {
    const h = harness();
    h.state.deferred = true;
    const offer = h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    h.pending[0].reject(new Error('Row too big to fit into CursorWindow'));
    await offer;
    assert.deepEqual([h.shown, h.cleared()], [[], 1]);
  });

  test('R2-6: a reflection save racing a list load: the save counts toward the cap; the saved habit is never offered', async () => {
    const store = createReflectionsStore(kvStorage());
    const offered: string[] = [];
    const queue = createOfferQueue({
      read: () => store.read('u1'),
      show: (o) => { offered.push(o.habitId); },
      clear: () => {},
      isFocused: () => true,
      today: () => DAY,
    });
    const save = (habitId: string, savedAt: number) => store.save('u1', {habitId, date: DAY, answers: ANSWERS, text: '', savedAt});
    // x's reflection is saved while y's tick (its load overtaken by Home's focus load) is offered
    await Promise.all([save('x', 1), queue.offer(habit('y'), DAY, rowsTicked('x', 'y'), 1)]);
    await queue.offer(habit('x'), DAY, rowsTicked('x', 'y'), 2);// x again: already reflected
    assert.deepEqual(offered, ['y']);
    // three saved and ticked: the cap is reached, so z gets nothing
    await save('y', 2);
    await save('w', 3);
    await queue.offer(habit('z'), DAY, rowsTicked('x', 'y', 'w', 'z'), 3);
    assert.deepEqual(offered, ['y']);
  });

  test('R2-7: an offer that resolves after Home lost focus is dropped (decided 2026-11-14)', async () => {
    const h = harness();
    h.state.deferred = true;
    const offer = h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    h.state.focused = false;// e.g. the habit form opened while the offer was reading
    h.pending[0].resolve(R.emptyRecord());
    await offer;
    await flush();
    assert.deepEqual([h.shown, h.cleared()], [[], 0]);
  });

  test('R2-8: a tap just before midnight: offered if it resolves the same day, dropped if the day is over', async () => {
    const h = harness();
    await h.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    assert.deepEqual(h.shown, ['a']);
    const late = harness();
    late.state.deferred = true;
    const offer = late.queue.offer(habit('a'), DAY, rowsTicked('a'), 1);
    late.state.today = '2026-11-15';
    late.pending[0].resolve(R.emptyRecord());
    await offer;
    assert.deepEqual(late.shown, []);
  });

  test('R2-9: only a reflection that would still pay is offered (ticked, not reflected, under the cap)', async () => {
    const h = harness();
    await h.queue.offer(habit('a'), DAY, rowsTicked(), 1);// not ticked in the rows
    assert.deepEqual([h.shown, h.cleared()], [[], 1]);
  });
});

describe('R-2: which tap keeps its toast', () => {
  test('the newest tap wins whatever order ticks arrive in; a saved reflection drops the toasts before it', () => {
    const order = createTickOrder();
    order.start(2);
    order.start(1);// the older tap arrives last
    assert.deepEqual([order.isLatest(1), order.isLatest(2)], [false, true]);
    order.reflection();
    assert.equal(order.isLatest(2), false);
    order.start(3);
    assert.equal(order.isLatest(3), true);
  });
});
