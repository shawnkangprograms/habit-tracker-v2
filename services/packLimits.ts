// The limit check for screens that don't already hold the level (docs/PACKS_REPORTS_SPEC.md, section 2b): the
// habit form when adding, the pack edit screen when creating, and a Settings retake of onboarding. The level
// comes only from the gamification stats (services/statsStore.ts over db/gamification.js, local SQLite, never
// the network), so a change to the XP curve flows through here untouched. Never at cold start.
//
// Never throws. If the stats can't be read the level is 1 (the lowest limits). If the count can't be read it is
// 0: the add itself then runs and fails or succeeds on its own.

import {getActiveHabitsWithDays} from '@/db/habits';
import {getGamificationStats} from '@/db/gamification';
import {packsStore} from '@/services/packsStore';
import {loadShared} from '@/services/statsStore';
import {getLocalDateString} from '@/utils/dates';
import type {GamificationStats} from '@/utils/gamification';
import {checkAdd, type AddCheck, type LimitKind} from '@/utils/packs/limits';

export async function currentLevel(uid: string): Promise<number> {
  try {
    const result = await loadShared(uid, getLocalDateString(), () => getGamificationStats(uid) as Promise<GamificationStats>);
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
  return checkAdd({level, kind, count, adding});
}
