// The stats every screen loads through services/gamificationStats.ts: XP, streaks and level (utils/gamification.ts),
// Vitality (utils/vitality.ts), the live radar (utils/radar/score.ts) and the awards (utils/awards.ts, C4). All
// derived, none stored. Types only.

import type {AwardState} from '@/utils/awards';
import type {GamificationStats} from '@/utils/gamification';
import type {Radar} from '@/utils/radar/score';
import type {Vitality} from '@/utils/vitality';

export type AppStats = GamificationStats & {vitality: Vitality; radar: Radar; awards: AwardState[]};
