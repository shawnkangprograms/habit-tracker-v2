// Geometry for the Habit Profile radar. Pure. Axis 0 points straight up; the rest follow clockwise, evenly
// spaced (the AXES order in types.ts is the Figma order).

export type Point = {x: number; y: number};

export function radarPoint(index: number, count: number, value: number, radius: number, cx: number, cy: number): Point {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const r = radius * Math.min(1, Math.max(0, value));
  return {x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r};
}

// SVG polygon points ("x,y x,y ...") for one value per axis (0..1)
export function polygonPoints(values: readonly number[], radius: number, cx: number, cy: number): string {
  return values
    .map((v, i) => radarPoint(i, values.length, v, radius, cx, cy))
    .map((p) => `${round(p.x)},${round(p.y)}`)
    .join(' ');
}

const round = (n: number) => Math.round(n * 100) / 100;
