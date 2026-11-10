// Chart geometry for components/charts. Pure (no React Native), so it runs under node:test.
// Values are numbers or null; null is a GAP: lines break there and no bar is drawn.

export type Box = {width: number; height: number};

// x of point i of n across `width` (one point sits in the middle)
export function pointX(i: number, n: number, width: number): number {
  return n <= 1 ? width / 2 : (i / (n - 1)) * width;
}

// y of value v on a 0..max axis, `height` tall (0 at the bottom)
export function valueY(v: number, max: number, height: number): number {
  const clamped = Math.min(Math.max(v, 0), max);
  return height - (max > 0 ? (clamped / max) * height : 0);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// One SVG path for a whole series: a new "M" after every gap. Single points between gaps are returned separately,
// because a lone "M" draws nothing; the chart marks them with a dot.
export function linePath(values: readonly (number | null)[], max: number, box: Box): {d: string; dots: {x: number; y: number}[]} {
  const n = values.length;
  let d = '';
  const dots: {x: number; y: number}[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null) continue;
    const x = r1(pointX(i, n, box.width));
    const y = r1(valueY(v, max, box.height));
    const startsRun = i === 0 || values[i - 1] === null;
    d += `${startsRun ? 'M' : 'L'}${x},${y} `;
    const endsRun = i === n - 1 || values[i + 1] === null;
    if (startsRun && endsRun) dots.push({x, y});
  }
  return {d: d.trim(), dots};
}

// Bar slot layout: n equal slots across width; the bar fills `fill` of its slot, centred
export function barSlot(i: number, n: number, width: number, fill = 0.7): {x: number; w: number; center: number} {
  const slot = n > 0 ? width / n : width;
  const w = Math.max(1, slot * fill);
  return {x: i * slot + (slot - w) / 2, w, center: i * slot + slot / 2};
}

// One SVG path holding every bar (one native view however many bars). Null values draw nothing; a 0 draws nothing
// either (it is a value: the tooltip still shows 0).
export function barsPath(values: readonly (number | null)[], max: number, box: Box): string {
  const n = values.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || v <= 0) continue;
    const {x, w} = barSlot(i, n, box.width);
    const y = valueY(v, max, box.height);
    const h = Math.max(box.height - y, 1.5);// a small non-zero value stays visible
    parts.push(`M${r1(x)},${r1(box.height)} V${r1(box.height - h)} H${r1(x + w)} V${r1(box.height)} Z`);
  }
  return parts.join(' ');
}

// The index under a tap at x (points: nearest point; bars: the slot)
export function nearestPoint(x: number, n: number, width: number): number {
  if (n <= 1 || width <= 0) return 0;
  return Math.min(n - 1, Math.max(0, Math.round((x / width) * (n - 1))));
}

export function slotAt(x: number, n: number, width: number): number {
  if (n <= 0 || width <= 0) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor((x / width) * n)));
}

// Axis labels for a long run of dates: first, middle and last (fewer when short)
export function axisTicks(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  return [0, Math.floor((n - 1) / 2), n - 1];
}

// Donut: each slice's start and length as fractions of the circle (zero slices are skipped)
export function donutArcs(values: readonly number[]): {index: number; start: number; length: number}[] {
  const total = values.reduce((sum, v) => sum + Math.max(v, 0), 0);
  if (total <= 0) return [];
  const arcs: {index: number; start: number; length: number}[] = [];
  let start = 0;
  values.forEach((v, index) => {
    if (v <= 0) return;
    const length = v / total;
    arcs.push({index, start, length});
    start += length;
  });
  return arcs;
}

// Which slice is under a tap at (x, y) on a donut centred at (cx, cy); slices start at 12 o'clock, clockwise.
// null outside the ring.
export function sliceAt(
  arcs: readonly {index: number; start: number; length: number}[],
  x: number, y: number, cx: number, cy: number, inner: number, outer: number,
): number | null {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < inner || dist > outer) return null;
  let turn = Math.atan2(dx, -dy) / (2 * Math.PI);// 0 at 12 o'clock, clockwise
  if (turn < 0) turn += 1;
  const hit = arcs.find((a) => turn >= a.start && turn < a.start + a.length);
  return hit ? hit.index : null;
}
