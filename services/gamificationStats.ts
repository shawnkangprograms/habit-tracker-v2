// XP, streaks, badges, level and Vitality for the signed-in user (docs/PACKS_REPORTS_SPEC.md, sections 13 and 16):
// the habit and completion rows from SQLite plus the reflections kept on this phone, read in parallel and computed
// together. Every screen that shows or uses these loads through here (Home, Profile, services/packLimits.ts), so
// they all agree. The database layer never sees reflections. Vitality is computed from the same rows: no extra
// query, no storage read. Read-only: creates no rows, never touches sync.

import {getSummaryRows} from '@/db/gamification';
import {reflectionsStore} from '@/services/reflectionsStore';
import {dailyCompletion} from '@/utils/dailyCompletion';
import {getLocalDateString} from '@/utils/dates';
import {computeGamification, type GamiCompletion, type GamiHabit} from '@/utils/gamification';
import {toGamiReflections} from '@/utils/reflections/record';
import {computeVitality, type AppStats} from '@/utils/vitality';

export async function getGamificationStats(userId: string, today = getLocalDateString()): Promise<AppStats> {
  const [rows, reflections] = await Promise.all([
    getSummaryRows(userId) as Promise<{habits: GamiHabit[]; completions: GamiCompletion[]}>,
    reflectionsStore.read(userId),// never throws; from memory after the first read
  ]);
  return {
    ...computeGamification(rows.habits, rows.completions, today, toGamiReflections(reflections)),
    vitality: computeVitality(dailyCompletion(rows.habits, rows.completions, today)),
  };
}
