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

// ---------- Fitting the radar and its labels to the screen width ----------

export const LABEL_SIZE = 12;// px, the axis labels' font size
export const LABEL_GAP = 12;// px from the outer hexagon to a label's anchor
export const LABEL_MARGIN = 4;// px kept clear inside the drawing area, on every side
export const RADIUS_MAX = 100;

export type LabelBox = {text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; left: number; right: number; top: number; bottom: number};
export type RadarFit = {width: number; height: number; cx: number; cy: number; radius: number; labels: LabelBox[]};

// A label's SVG anchor and baseline for axis i, with its box (estimated width, cap height above the baseline,
// descent below). Top and bottom labels sit centred above or below the shape; side labels grow away from it.
function placeLabel(text: string, i: number, count: number, radius: number, cx: number, cy: number, width: (t: string) => number): LabelBox {
  const p = radarPoint(i, count, 1, radius + LABEL_GAP, cx, cy);
  const anchor = Math.abs(p.x - cx) < 1 ? 'middle' : p.x < cx ? 'end' : 'start';
  const dy = p.y < cy - 1 ? -2 : p.y > cy + 1 ? 10 : 4;// keep top and bottom labels clear of the shape
  const y = p.y + dy;
  const w = width(text);
  const left = anchor === 'start' ? p.x : anchor === 'end' ? p.x - w : p.x - w / 2;
  return {text, x: p.x, y, anchor, left, right: left + w, top: y - LABEL_SIZE, bottom: y + LABEL_SIZE * 0.3};
}

// The largest radius (up to RADIUS_MAX) that keeps every label inside a drawing area `width` wide, given an
// upper bound on each label's width. The height follows from the radius, with the centre in the middle, so a
// view scaling about its own centre scales about the radar's.
export function fitRadar(width: number, labels: readonly string[], labelWidth: (text: string) => number): RadarFit {
  const count = labels.length;
  const cx = width / 2;
  let radius = RADIUS_MAX;
  for (let i = 0; i < count; i++) {
    const p = radarPoint(i, count, 1, 1, 0, 0);// unit direction
    if (Math.abs(p.x) < 1e-6) continue;// top and bottom labels are centred: limited by the height, not the width
    // |p.x| * (radius + gap) + label width <= cx - margin
    radius = Math.min(radius, (cx - LABEL_MARGIN - labelWidth(labels[i])) / Math.abs(p.x) - LABEL_GAP);
  }
  radius = Math.max(0, Math.floor(radius));
  // room above for the top label (gap, 2 px lift, its height) and below for the bottom one (gap, its baseline
  // offset and descent)
  const cy = radius + LABEL_GAP + 2 + LABEL_SIZE + LABEL_MARGIN;
  const height = 2 * cy;
  return {width, height, cx, cy, radius, labels: labels.map((text, i) => placeLabel(text, i, count, radius, cx, cy, labelWidth))};
}
