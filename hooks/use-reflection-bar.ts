import {useCallback, useRef, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {reflectionsStore} from '@/services/reflectionsStore';
import {getLocalDateString} from '@/utils/dates';
import {expired, forDay, withoutHabit, type ReflectionBar} from '@/utils/reflections/bar';
import {createOfferQueue, type OfferHabit, type OfferRow} from '@/utils/reflections/offers';

// Home's reflection bar (docs/PACKS_REPORTS_SPEC.md, section 16). Offered only after the user's own completing
// tick, and only while that reflection would still earn XP today; never on launch, focus, sync or un-tick. The
// next offer replaces it; un-ticking its habit, a new day, tapping it and Home losing focus remove it. Which tick
// gets the bar follows tap order, not the order offers finish (utils/reflections/offers.ts, R-2).
export function useReflectionBar(userId: string | undefined) {
  const [bar, setBar] = useState<ReflectionBar | null>(null);
  const lastId = useRef(0);
  const focused = useRef(false);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      setBar(null);
    };
  }, []));

  // one queue per user (a new user starts fresh)
  const queueFor = useRef<{userId: string; queue: ReturnType<typeof createOfferQueue>} | null>(null);
  const queue = useCallback((uid: string) => {
    if (queueFor.current?.userId !== uid) {
      queueFor.current = {userId: uid, queue: createOfferQueue({
        read: () => reflectionsStore.read(uid),// rejects if unreadable (F-1): no offer
        show: (offer) => setBar({id: ++lastId.current, ...offer}),
        clear: () => setBar(null),
        isFocused: () => focused.current,
        today: () => getLocalDateString(),
      })};
    }
    return queueFor.current.queue;
  }, []);

  // rows: today's rows read after the tick; date: the local day of the tap; tap: the tap's number. Never throws.
  const offer = useCallback((habit: OfferHabit, date: string, rows: readonly OfferRow[], tap: number) => {
    if (!userId) return Promise.resolve();
    return queue(userId).offer(habit, date, rows, tap);
  }, [userId, queue]);

  const untick = useCallback((habitId: string, tap: number) => {
    if (userId) queue(userId).untick(habitId, tap);// its offer, still reading or not started, is dropped
    setBar((b) => withoutHabit(b, habitId));
  }, [userId, queue]);

  const dayChanged = useCallback((today: string) => setBar((b) => forDay(b, today)), []);
  const expire = useCallback((id: number) => setBar((b) => expired(b, id)), []);

  const open = useCallback((tapped: ReflectionBar) => {
    setBar(null);
    router.push({pathname: '/reflect', params: {habitId: tapped.habitId, habitName: tapped.habitName, date: tapped.date}});
  }, []);

  return {bar, offer, untick, dayChanged, expire, open};
}
