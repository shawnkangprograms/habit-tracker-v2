// The stats every screen loads through services/gamificationStats.ts: XP, streaks and level (utils/gamification.ts),
// Vitality (utils/vitality.ts) and the live radar (utils/radar/score.ts). All derived, none stored. Types only.

import type {GamificationStats} from '@/utils/gamification';
import type {Radar} from '@/utils/radar/score';
import type {Vitality} from '@/utils/vitality';

export type AppStats = GamificationStats & {vitality: Vitality; radar: Radar};
