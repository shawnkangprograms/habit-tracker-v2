// The limit check for screens that don't already hold the level (docs/PACKS_REPORTS_SPEC.md, section 2b): the
// habit form when adding, the pack edit screen when creating, and a Settings retake of onboarding. The level
// comes only from the gamification stats (services/statsStore.ts over services/gamificationStats.ts: local SQLite
// and the reflections on this phone, never the network), so a change to the XP curve flows through here untouched. Never at cold start.
//
// Never throws. If the stats can't be read the level is 1 (the lowest limits). If the count can't be read it is
// 0: the add itself then runs and fails or succeeds on its own.

import {getActiveHabitsWithDays} from '@/db/habits';
import {getGamificationStats} from '@/services/gamificationStats';
import {packsStore} from '@/services/packsStore';
import {loadShared} from '@/services/statsStore';
import {getLocalDateString} from '@/utils/dates';
import {checkAdd, limitCheckTrace, type AddCheck, type LimitCheckTrace, type LimitKind} from '@/utils/packs/limits';

// Diagnostic (Job B): the last check made through checkAddFor in this app run, for the hidden trace panel. Memory
// only (lost on restart), numbers only.
let lastCheck: LimitCheckTrace | null = null;

export function lastLimitCheck(): LimitCheckTrace | null {
  return lastCheck;
}

export async function currentLevel(uid: string): Promise<number> {
  try {
    const result = await loadShared(uid, getLocalDateString(), () => getGamificationStats(uid));
    return result.entry?.stats.level ?? 1;
  } catch {
    return 1;
  }
}

async function countOf(uid: string, kind: LimitKind): Promise<number> {
  try {
    if (kind === 'habits') return ((await getActiveHabitsWithDays(uid)) as unknown[]).length;
    const parsed = await packsStore.read(uid);
    return parsed.kind === 'ok' ? parsed.record.packs.length : 0;
  } catch {
    return 0;
  }
}

export async function checkAddFor(uid: string, kind: LimitKind, adding = 1): Promise<AddCheck> {
  const [level, count] = await Promise.all([currentLevel(uid), countOf(uid, kind)]);
  const input = {level, kind, count, adding};
  const check = checkAdd(input);
  lastCheck = limitCheckTrace(input, check, Date.now());
  return check;
}

// A fresh count of this account's active habits, for the trace panel to show beside the last check. null if it
// can't be read (unlike countOf, which treats that as 0 so an add can still run)
export async function activeHabitCount(uid: string): Promise<number | null> {
  try {
    return ((await getActiveHabitsWithDays(uid)) as unknown[]).length;
  } catch {
    return null;
  }
}
