// XP, streaks, badges and level for the signed-in user (docs/PACKS_REPORTS_SPEC.md, section 16): the habit and
// completion rows from SQLite plus the reflections kept on this phone, read in parallel and computed together.
// Every screen that shows or uses XP or level loads through here (Home, Profile, services/packLimits.ts), so they
// all agree. The database layer never sees reflections. Read-only: creates no rows, never touches sync.

import {getSummaryRows} from '@/db/gamification';
import {reflectionsStore} from '@/services/reflectionsStore';
import {getLocalDateString} from '@/utils/dates';
import {computeGamification, type GamiCompletion, type GamiHabit, type GamificationStats} from '@/utils/gamification';
import {toGamiReflections} from '@/utils/reflections/record';

export async function getGamificationStats(userId: string, today = getLocalDateString()): Promise<GamificationStats> {
  const [rows, reflections] = await Promise.all([
    getSummaryRows(userId) as Promise<{habits: GamiHabit[]; completions: GamiCompletion[]}>,
    reflectionsStore.read(userId),// never throws; from memory after the first read
  ]);
  return computeGamification(rows.habits, rows.completions, today, toGamiReflections(reflections));
}
