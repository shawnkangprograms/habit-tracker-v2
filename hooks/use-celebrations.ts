import {useCallback, useRef, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCompletionTimes} from '@/db/completionTimes';
import {createCelebratedStore} from '@/services/celebratedStore';
import {getCelebrationsEnabled, useCelebrationsEnabled} from '@/services/celebrationPrefs';
import type {PublishResult} from '@/services/statsStore';
import {
  celebrationsOrHeld, createMessagePicker, createTickOrder, diffTick, dismissItem, dropToasts, earlyKey, enqueue, messageVars,
  pickSituation, tickItems, type QueueItem,
} from '@/utils/celebrations';
import {isEarlierThanUsual, sameDaySamples} from '@/utils/completionTime';
import {SAVED_PLAIN} from '@/utils/reflections/copy';
import {getLocalDateString} from '@/utils/dates';
import type {GamificationStats} from '@/utils/gamification';

const celebratedStore = createCelebratedStore(AsyncStorage);

// What Home's post-tick stats load resolved to (the same load as before; nothing extra is read)
export type TickStats = {snapshot: {date: string; stats: GamificationStats} | null; published: PublishResult};

export type TickArgs = {
  habitId: string;
  tickedAt: number;// Date.now() at the tap
  rows: {completed: number}[];// the rows loadHabits just loaded: today's scheduled habits
  stats: Promise<TickStats | null>;
  tap: number;// the tap's number (R-2): the newest tap keeps its toast, whatever order ticks arrive in
};

// "Earlier than usual" for this habit. One indexed read, after the screen has updated. Never throws.
async function isEarlyTick(userId: string, habitId: string, tickedAt: number, today: string): Promise<boolean> {
  try {
    const rows = await getCompletionTimes(userId, habitId, today);
    return isEarlierThanUsual(tickedAt, sameDaySamples(rows));
  } catch (err) {
    console.log('Early check failed', err);
    return false;
  }
}

// Dev only: per-tick timings, in ms from the tap
export function tickLog(message: string) {
  if (__DEV__) console.log(`Tick feedback: ${message}`);
}

// Celebrations and encouragement for Home. Only onTick (the user's own completing tick) and onReflection (Home's
// first focus after the user saved a reflection) ever add anything: never launch, a plain focus, sync or un-tick. Shows one item at a time, only while Home is focused and the setting
// is on. Leaving Home drops waiting toasts; celebrations wait.
//
// Ticks are handled concurrently, not one after another, so a new tick never waits behind an older one.
// Once a newer tap's tick has started, an older tap's tick still queues its celebrations (and marks them) but drops
// its toast; "newer" is by tap number, not arrival order (R-2, utils/celebrations.ts createTickOrder). Two ticks
// can't celebrate the same thing: each one diffs against the entry the previous publish replaced, so their changes
// don't overlap.
export function useCelebrations(userId: string | undefined) {
  const enabled = useCelebrationsEnabled();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [focused, setFocused] = useState(false);
  const [picker] = useState(createMessagePicker);
  const lastId = useRef(0);
  const [order] = useState(createTickOrder);// which tap keeps its toast (R-2)

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => {
      setFocused(false);
      setQueue(dropToasts);
    };
  }, []));

  const handleTick = useCallback(async (tick: TickArgs) => {
    if (!userId || !getCelebrationsEnabled()) return;
    const isLatest = () => order.isLatest(tick.tap);
    const handedOverMs = Date.now() - tick.tickedAt;
    const result = await tick.stats;
    const statsMs = Date.now() - tick.tickedAt;
    // comparable: same user and day, and no remote change since the previous entry's load started
    if (!result?.snapshot || !result.published.comparable || !result.published.previous) return;
    const today = result.snapshot.date;
    if (getLocalDateString(new Date(tick.tickedAt)) !== today) return;// tapped just before midnight

    const doneToday = tick.rows.filter((row) => row.completed === 1).length;
    const diff = diffTick({
      before: result.published.previous.stats,
      after: result.snapshot.stats,
      doneToday,
      scheduledToday: tick.rows.length,
    });
    if (!diff) return;

    // null: the celebrated keys can't be read, so every celebration is held for this tick (ordinary toasts still show)
    const celebrated = await celebratedStore.known(userId);
    const {celebrations, keys, repeats} = celebrationsOrHeld(diff, today, celebrated);
    // a celebration suppresses the toast and a repeat outranks early praise, so the early read is only needed
    // without either (and only for a toast that can still be shown). Repeats mark nothing. No early praise while held.
    const readEarly = celebrated !== null && celebrations.length === 0 && repeats.length === 0 && isLatest()
      && !celebrated.has(earlyKey(today));
    const earlyStartedAt = Date.now();
    const early = readEarly && await isEarlyTick(userId, tick.habitId, tick.tickedAt, today);
    const earlyNote = readEarly ? `early read ${Date.now() - earlyStartedAt} ms` : 'early read skipped';

    if (celebrations.length === 0 && !isLatest()) {
      tickLog(`dropped, a newer tick has started (${Date.now() - tick.tickedAt} ms after the tap)`);
      return;
    }
    const vars = messageVars(diff);
    const situation = celebrations.length === 0 ? pickSituation(diff, early, repeats) : null;
    const toast = situation ? picker.pick(situation, vars) : null;
    if (situation === 'early') keys.push(earlyKey(today));
    const items = tickItems(celebrations, toast, vars, picker, () => ++lastId.current)
      .map((item) => (item.kind === 'toast' ? {...item, tappedAt: tick.tickedAt} : item));

    if (items.length > 0 && getCelebrationsEnabled()) {
      tickLog(`queued ${items.map((i) => i.kind).join(', ')} at ${Date.now() - tick.tickedAt} ms ` +
        `(list loaded at ${handedOverMs}, stats at ${statsMs}, ${earlyNote})`);
      setQueue((q) => enqueue(q, items));
    }
    await celebratedStore.mark(userId, keys, today);// at enqueue time
  }, [userId, picker, order]);

  const onTick = useCallback((tick: TickArgs) => {
    order.start(tick.tap);
    handleTick(tick).catch((err: unknown) => console.log('Tick feedback failed', err));
  }, [handleTick, order]);

  // A saved reflection: the level-up overlay if its XP reached a new level, otherwise a short toast ("+20 XP" only
  // when the reflection XP really went up). Completions didn't change, so nothing else can be celebrated.
  const handleReflection = useCallback(async (stats: Promise<TickStats | null>) => {
    if (!userId || !getCelebrationsEnabled()) return;
    const result = await stats;
    if (!result?.snapshot) return;
    const today = result.snapshot.date;
    const before = result.published.comparable ? result.published.previous?.stats : undefined;
    const diff = before ? diffTick({before, after: result.snapshot.stats, doneToday: 0, scheduledToday: 0}) : null;
    const rewarded = !!before && result.snapshot.stats.reflectionXp > before.reflectionXp;

    // unknown celebrated keys: the toast still shows, the level-up overlay is held
    const celebrated = diff ? await celebratedStore.known(userId) : null;
    const found = diff ? celebrationsOrHeld(diff, today, celebrated) : null;
    const celebrations = found?.celebrations.filter((c) => c.kind === 'levelUp') ?? [];
    const keys = found?.keys.filter((k) => k.startsWith('level:')) ?? [];
    const vars = diff ? messageVars(diff) : null;
    const toast = rewarded && vars ? picker.pick('reflectionSaved', vars) : SAVED_PLAIN;
    const items = vars
      ? tickItems(celebrations, toast, vars, picker, () => ++lastId.current)
      : [{id: ++lastId.current, kind: 'toast' as const, text: toast ?? SAVED_PLAIN}];
    if (getCelebrationsEnabled()) setQueue((q) => enqueue(q, items));
    await celebratedStore.mark(userId, keys, today);
  }, [userId, picker]);

  const onReflection = useCallback((stats: Promise<TickStats | null>) => {
    order.reflection();// an older tick still waiting drops its toast
    handleReflection(stats).catch((err: unknown) => console.log('Reflection feedback failed', err));
  }, [handleReflection, order]);

  const dismiss = useCallback((id: number) => setQueue((q) => dismissItem(q, id)), []);

  const current = focused && enabled ? queue[0] ?? null : null;
  return {current, dismiss, onTick, onReflection};
}
