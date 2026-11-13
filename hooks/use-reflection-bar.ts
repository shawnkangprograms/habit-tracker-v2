import {useCallback, useRef, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {reflectionsStore} from '@/services/reflectionsStore';
import {expired, forDay, withoutHabit, type ReflectionBar} from '@/utils/reflections/bar';
import {wouldReward} from '@/utils/reflections/rewards';

// Home's reflection bar (docs/PACKS_REPORTS_SPEC.md, section 16). Offered only after the user's own completing
// tick, and only while that reflection would still earn XP today; never on launch, focus, sync or un-tick. The
// next offer replaces it; un-ticking its habit, a new day, tapping it and Home losing focus remove it.
export function useReflectionBar(userId: string | undefined) {
  const [bar, setBar] = useState<ReflectionBar | null>(null);
  const lastId = useRef(0);
  const latestOffer = useRef(0);// a slower, older offer never replaces a newer tick's bar
  const offering = useRef<string | null>(null);// habitId of the offer still reading, if any

  useFocusEffect(useCallback(() => () => setBar(null), []));

  // rows: today's rows just loaded after the tick; date: the local day of the tap. Never throws.
  const offer = useCallback(async (habit: {habitId: string; habitName: string}, date: string, rows: {habitId: string; completed: number}[]) => {
    if (!userId) return;
    const seq = ++latestOffer.current;
    offering.current = habit.habitId;
    const ticked = new Set(rows.filter((r) => r.completed === 1).map((r) => r.habitId));
    const record = await reflectionsStore.read(userId).catch(() => null);// unreadable (F-1): no offer
    if (seq !== latestOffer.current) return;
    offering.current = null;
    if (!record || !wouldReward(record, {habitId: habit.habitId, date, ticked})) {
      setBar(null);// the newest tick has no offer: an older tick's bar doesn't stay up for it
      return;
    }
    setBar({id: ++lastId.current, habitId: habit.habitId, habitName: habit.habitName, date});
  }, [userId]);

  const untick = useCallback((habitId: string) => {
    if (offering.current === habitId) latestOffer.current += 1;// its offer, still reading, is dropped
    setBar((b) => withoutHabit(b, habitId));
  }, []);

  const dayChanged = useCallback((today: string) => setBar((b) => forDay(b, today)), []);
  const expire = useCallback((id: number) => setBar((b) => expired(b, id)), []);

  const open = useCallback((tapped: ReflectionBar) => {
    setBar(null);
    router.push({pathname: '/reflect', params: {habitId: tapped.habitId, habitName: tapped.habitName, date: tapped.date}});
  }, []);

  return {bar, offer, untick, dayChanged, expire, open};
}
