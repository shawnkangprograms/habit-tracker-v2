// The award artwork's geometry (C4 Set 2, option B): one frame per award group, the ornaments of the top streaks, and
// what sits on each award's face (a number or a MaterialCommunityIcons glyph). Pure: path strings and numbers on the
// 100 x 120 grid components/award-badge.tsx draws on, so tests/award-art.test.ts can check them under Node.
//
// Every frame keeps the face clear: a solid disc (FACE) in the tier's light colour with the number or glyph in
// colors.onAccent ink (or, locked, the dark locked face with muted ink), so the ink never sits on a gradient.
import type {AwardDef, AwardGroup} from '@/utils/awards';

export const VIEW_W = 100;
export const VIEW_H = 120;
export const FACE = {cx: 50, cy: 60, r: 24} as const;

const f = (n: number) => Number(n.toFixed(2));

// A closed polygon through the points
export function polygonPath(points: readonly (readonly [number, number])[]): string {
  return `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;
}

// A regular polygon (n corners, radius r), the first corner at `startDeg` (-90 = straight up)
export function regularPolygon(cx: number, cy: number, r: number, n: number, startDeg = -90): string {
  return polygonPath(Array.from({length: n}, (_, i) => {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  }));
}

// A star burst: `points` tips at radius `outer`, notches at `inner`
export function starPath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  return polygonPath(Array.from({length: points * 2}, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + (180 * i) / points) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  }));
}

// A rosette: a circle with `bumps` rounded scallops between radius `inner` and `outer`
export function scallopPath(cx: number, cy: number, inner: number, outer: number, bumps: number): string {
  const at = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  };
  const step = 360 / bumps;
  let d = `M${at(inner, -90)}`;
  for (let i = 0; i < bumps; i++) {
    const a0 = -90 + i * step;
    d += ` Q${at(outer * 1.08, a0 + step / 2)} ${at(inner, a0 + step)}`;
  }
  return `${d} Z`;
}

// A circle as a path (two arcs)
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${cy} A${r} ${r} 0 1 0 ${f(cx + r)} ${cy} A${r} ${r} 0 1 0 ${f(cx - r)} ${cy} Z`;
}

// Laurel leaves along both sides of an arc: centres and rotations of small ellipses
export type Leaf = {cx: number; cy: number; rotate: number};
export function laurelLeaves(cx: number, cy: number, r: number, count: number): Leaf[] {
  const leaves: Leaf[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i++) {
      const deg = 90 + side * (35 + (i * 100) / count);// from the bottom up each side
      const a = (deg * Math.PI) / 180;
      leaves.push({cx: f(cx + r * Math.cos(a)), cy: f(cy + r * Math.sin(a)), rotate: f(deg + side * 70)});
    }
  }
  return leaves;
}

// The six streak medals' shield, rim, ribbons and flame (unchanged from the 1.0 medal)
const SHIELD = 'M50 20 L84 30 L84 60 Q84 88 50 104 Q16 88 16 60 L16 30 Z';
const SHIELD_RIM = 'M50 27 L77 35 L77 60 Q77 83 50 96 Q23 83 23 60 L23 35 Z';
export const RIBBON_LEFT = 'M31 82 L22 118 L31 111 L39 118 L45 90 Z';
export const RIBBON_RIGHT = 'M69 82 L78 118 L69 111 L61 118 L55 90 Z';
export const FLAME = 'M50 1 C57 8 61 13 60 19 C59 24 55 27 50 27 C45 27 41 24 40 19 C39 14 43 10 46 6 C47 10 48 13 50 14 C51 9 50 5 50 1 Z';
const flameAt = (dx: number) => FLAME.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(Number(x) + dx)} ${y}`);
export const FLAME_LEFT = flameAt(-13);
export const FLAME_RIGHT = flameAt(13);

export type Frame = {body: string; rim: string; ribbons: boolean; flame: boolean; laurel: boolean};

// One frame per group, so a group reads at a glance
export const FRAMES: Record<AwardGroup, Frame> = {
  streaks: {body: SHIELD, rim: SHIELD_RIM, ribbons: true, flame: true, laurel: false},
  perfect: {body: starPath(50, 60, 42, 33, 8), rim: circlePath(50, 60, 30), ribbons: false, flame: false, laurel: false},
  volume: {body: circlePath(50, 60, 38), rim: circlePath(50, 60, 32), ribbons: true, flame: false, laurel: false},
  consistency: {body: regularPolygon(50, 60, 41, 6), rim: regularPolygon(50, 60, 34, 6), ribbons: false, flame: false, laurel: false},
  comebacks: {body: circlePath(50, 60, 33), rim: circlePath(50, 60, 28), ribbons: false, flame: false, laurel: true},
  mastery: {body: scallopPath(50, 60, 36, 41, 14), rim: circlePath(50, 60, 31), ribbons: true, flame: false, laurel: false},
  variety: {body: polygonPath([[50, 17], [90, 60], [50, 103], [10, 60]]), rim: polygonPath([[50, 26], [81, 60], [50, 94], [19, 60]]),
    ribbons: false, flame: false, laurel: false},
  time: {body: 'M22 22 L78 22 Q84 22 84 28 L84 100 L50 88 L16 100 L16 28 Q16 22 22 22 Z',
    rim: 'M27 28 L73 28 Q78 28 78 33 L78 91 L50 81 L22 91 L22 33 Q22 28 27 28 Z', ribbons: false, flame: false, laurel: false},
};

export const LAUREL = laurelLeaves(50, 60, 40, 5);// the comeback frame's wreath, and the 365-day streak's

// What sits on an award's face: its number (a count award, "1k" for a thousand) or a glyph
export type Centre = {kind: 'number'; text: string} | {kind: 'glyph'; glyph: string};

const GLYPHS: Record<string, string> = {
  weekend: 'calendar-weekend',
  steady7: 'calendar-week',
  steady30: 'calendar-month',
  neverTwice: 'shield-check-outline',
  comeback: 'restore',
};

export function awardCentre(award: AwardDef): Centre {
  const rule = award.rule;
  switch (rule.kind) {
    case 'weekend': return {kind: 'glyph', glyph: GLYPHS.weekend};
    case 'steady': return {kind: 'glyph', glyph: rule.days === 7 ? GLYPHS.steady7 : GLYPHS.steady30};
    case 'neverTwice': return {kind: 'glyph', glyph: GLYPHS.neverTwice};
    case 'comeback': return {kind: 'glyph', glyph: GLYPHS.comeback};
    default: return {kind: 'number', text: rule.n >= 1000 ? `${rule.n / 1000}k` : String(rule.n)};
  }
}

// The number's size on the face, as a share of the badge width: smaller for three characters so it stays on the face
export const numberScale = (text: string) => (text.length >= 3 ? 0.21 : 0.28);
