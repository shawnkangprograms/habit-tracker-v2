// XP, streaks, badges, level, Vitality and the live radar for the signed-in user (docs/PACKS_REPORTS_SPEC.md,
// sections 11, 13 and 16): the habit and completion rows from SQLite plus what is kept on this phone (reflections,
// the radar's areas map), read in parallel and computed together. Every screen that shows or uses these loads
// through here (Home, Profile, services/packLimits.ts), so they all agree. The database layer never sees
// reflections or areas. Vitality and the radar use the same rows: no extra query. Storage reads: the reflections
// and the areas map, once per app run each (then from memory), and the packs record only when it isn't in memory
// already (it normally is, from the startup mirror). Read-only: creates no rows, never touches sync.

import {getSummaryRows} from '@/db/gamification';
import {areasStore} from '@/services/areasStore';
import {packsStore} from '@/services/packsStore';
import {reflectionsStore} from '@/services/reflectionsStore';
import type {AppStats} from '@/utils/appStats';
import {dailyCompletion} from '@/utils/dailyCompletion';
import {getLocalDateString} from '@/utils/dates';
import {computeGamification, type GamiCompletion} from '@/utils/gamification';
import {computeRadar, type RadarHabit} from '@/utils/radar/score';
import {toGamiReflections} from '@/utils/reflections/record';
import {computeVitality} from '@/utils/vitality';

export async function getGamificationStats(userId: string, today = getLocalDateString()): Promise<AppStats> {
  const [rows, reflections, areas, packs] = await Promise.all([
    getSummaryRows(userId) as Promise<{habits: RadarHabit[]; completions: GamiCompletion[]}>,
    reflectionsStore.read(userId),// never throws; from memory after the first read
    areasStore.read(userId),// never throws; failed or corrupt is an empty map (icon areas)
    packsStore.peek(userId)?.parsed ?? packsStore.read(userId),// never throws
  ]);
  return {
    ...computeGamification(rows.habits, rows.completions, today, toGamiReflections(reflections)),
    vitality: computeVitality(dailyCompletion(rows.habits, rows.completions, today)),
    radar: computeRadar({
      habits: rows.habits, completions: rows.completions, today, areas,
      packs: packs.kind === 'ok' ? packs.record : null,
    }),
  };
}
