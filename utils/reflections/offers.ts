// Which tick gets the reflection bar (docs/PACKS_REPORTS_SPEC.md, section 16; R-2). The reflections read is injected
// (services/reflectionsStore.ts in the app, a fake in tests), so the order of events can be tested without React.
//
// Every tap on Home gets a number when it happens (app/(tabs)/index.tsx handleToggle), and these rules use it, not
// the order in which offers finish:
// - the newest tap wins: an offer from an older tap than one already offered is ignored, even if its list load or
//   its read finishes last;
// - un-ticking a habit drops any offer from an earlier tap on that habit, still reading or not started yet;
// - an offer that resolves after Home lost focus is dropped (decided 2026-11-14), so no bar waits unseen;
// - an offer for a day that is already over (a tap just before midnight) is dropped;
// - only a reflection that would still earn XP today is offered; if the reflections can't be read (F-1) nothing is,
//   and the newest tap's "no offer" also clears an older tap's bar.

import {wouldReward} from '@/utils/reflections/rewards';
import type {ReflectionsRecord} from '@/utils/reflections/record';

export type OfferHabit = {habitId: string; habitName: string};
export type OfferRow = {habitId: string; completed: number};

export function createOfferQueue(deps: {
  read: () => Promise<ReflectionsRecord>;// rejects if the reflections can't be read
  show: (offer: OfferHabit & {date: string}) => void;
  clear: () => void;
  isFocused: () => boolean;
  today: () => string;
}) {
  let newest = 0;// the newest tap an offer has started for
  const untickedAt = new Map<string, number>();// habitId -> the tap that un-ticked it last

  const dropped = (habitId: string, tap: number) => tap < newest || (untickedAt.get(habitId) ?? 0) > tap;

  // rows: today's rows read after this tap's save; date: the local day of the tap. Never throws.
  async function offer(habit: OfferHabit, date: string, rows: readonly OfferRow[], tap: number): Promise<void> {
    if (dropped(habit.habitId, tap)) return;
    newest = tap;
    const ticked = new Set(rows.filter((r) => r.completed === 1).map((r) => r.habitId));
    const record = await deps.read().catch(() => null);
    if (dropped(habit.habitId, tap) || newest !== tap) return;
    if (!deps.isFocused() || date !== deps.today()) return;
    if (!record || !wouldReward(record, {habitId: habit.habitId, date, ticked})) {
      deps.clear();// the newest tick has no offer: an older tick's bar doesn't stay up for it
      return;
    }
    deps.show({habitId: habit.habitId, habitName: habit.habitName, date});
  }

  // A completed un-tick of this habit at this tap: earlier taps' offers for it are dropped
  function untick(habitId: string, tap: number): void {
    untickedAt.set(habitId, Math.max(untickedAt.get(habitId) ?? 0, tap));
  }

  return {offer, untick};
}
