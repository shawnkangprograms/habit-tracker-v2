// The limit check for screens that don't already hold the level (docs/PACKS_REPORTS_SPEC.md, section 2b): the
// habit form when adding, the pack edit screen when creating, and a Settings retake of onboarding. The level
// comes only from the gamification stats (services/statsStore.ts over services/gamificationStats.ts: local SQLite
// and the reflections on this phone, never the network), so a change to the XP curve flows through here untouched. Never at cold start.
//
// Never throws. If the stats can't be loaded, the last ones loaded are used; with none, the level from ticks alone
// (a lower bound, F-1), and a refusal then never names a level; if even that fails, level 1, also unknown. If the
// count can't be read it is 0: the add itself then runs and fails or succeeds on its own.

import {getActiveHabitsWithDays} from '@/db/habits';
import {getGamificationStats, getTicksOnlyLevel} from '@/services/gamificationStats';
import {packsStore} from '@/services/packsStore';
import {loadShared} from '@/services/statsStore';
import {getLocalDateString} from '@/utils/dates';
import {
  checkAddAtLevel, limitCheckTrace, type AddCheck, type KnownLevel, type LimitCheckTrace, type LimitKind,
} from '@/utils/packs/limits';

// Diagnostic (Job B): the last check made through checkAddFor in this app run, for the hidden trace panel. Memory
// only (lost on restart), numbers only.
let lastCheck: LimitCheckTrace | null = null;

export function lastLimitCheck(): LimitCheckTrace | null {
  return lastCheck;
}

export async function currentLevel(uid: string): Promise<KnownLevel> {
  try {
    // after a failed load, loadShared still returns the last entry loaded: the last known level
    const result = await loadShared(uid, getLocalDateString(), () => getGamificationStats(uid));
    if (result.entry) return {level: result.entry.stats.level, known: true};
  } catch {
    // fall through to the lower bound
  }
  try {
    return {level: await getTicksOnlyLevel(uid), known: false};
  } catch {
    return {level: 1, known: false};
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
  const [at, count] = await Promise.all([currentLevel(uid), countOf(uid, kind)]);
  const input = {...at, kind, count, adding};
  const check = checkAddAtLevel(input);
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
