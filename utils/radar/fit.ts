// Fitting the Summary radar's two-line labels to the screen width (docs/PACKS_REPORTS_SPEC.md, section 11). Pure.
// A separate path from utils/onboarding/radar.ts fitRadar, which the onboarding radar keeps using unchanged; this
// reuses its geometry and constants. Each label is two lines: the area name, then "{n}%" or "–".
//
// The radius is the largest (up to RADIUS_MAX) that keeps every label inside the drawing area, from an upper bound on
// each label's width (the wider of its two lines; for the area names that is the first line). Side labels grow away
// from the shape as on the onboarding radar. Labels above the centre stack upward from the point (the name line on
// top), labels below stack downward, so the top and bottom labels each need two lines of vertical room; the centre
// stays in the middle of the drawing, so a view scaling about its own centre scales about the radar's.

import {LABEL_GAP, LABEL_MARGIN, LABEL_SIZE, RADIUS_MAX, radarPoint} from '@/utils/onboarding/radar';

export const LINE_HEIGHT = 15;// px between the two lines' baselines (12 px text)
const ABOVE_LIFT = 2;// px from the point to the lower line's baseline, for labels above the shape
const BELOW_DROP = 10;// px from the point to the upper line's baseline, for labels below it
const DESCENT = LABEL_SIZE * 0.3;

export type TwoLineLabel = {
  first: string;
  second: string;
  x: number;
  firstY: number;// baselines
  secondY: number;
  anchor: 'start' | 'middle' | 'end';
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TwoLineFit = {width: number; height: number; cx: number; cy: number; radius: number; labels: TwoLineLabel[]};

function place(
  label: {first: string; second: string}, i: number, count: number, radius: number, cx: number, cy: number,
  width: (t: string) => number,
): TwoLineLabel {
  const p = radarPoint(i, count, 1, radius + LABEL_GAP, cx, cy);
  const anchor = Math.abs(p.x - cx) < 1 ? 'middle' : p.x < cx ? 'end' : 'start';
  let firstY: number;
  if (p.y < cy - 1) firstY = p.y - ABOVE_LIFT - LINE_HEIGHT;// above: the block ends just above the point
  else if (p.y > cy + 1) firstY = p.y + BELOW_DROP;// below: the block starts just below it
  else firstY = p.y + 4 - LINE_HEIGHT / 2;// level with the centre: centred on the point
  const secondY = firstY + LINE_HEIGHT;
  const w = Math.max(width(label.first), width(label.second));
  const left = anchor === 'start' ? p.x : anchor === 'end' ? p.x - w : p.x - w / 2;
  return {...label, x: p.x, firstY, secondY, anchor, left, right: left + w, top: firstY - LABEL_SIZE, bottom: secondY + DESCENT};
}

export function fitRadarTwoLine(
  width: number,
  labels: readonly {first: string; second: string}[],
  labelWidth: (text: string) => number,
): TwoLineFit {
  const count = labels.length;
  const cx = width / 2;
  let radius = RADIUS_MAX;
  for (let i = 0; i < count; i++) {
    const p = radarPoint(i, count, 1, 1, 0, 0);// unit direction
    if (Math.abs(p.x) < 1e-6) continue;// top and bottom labels are centred: limited by the height, not the width
    const w = Math.max(labelWidth(labels[i].first), labelWidth(labels[i].second));
    radius = Math.min(radius, (cx - LABEL_MARGIN - w) / Math.abs(p.x) - LABEL_GAP);
  }
  radius = Math.max(0, Math.floor(radius));
  // two lines of room above the top label's point and below the bottom one's, the larger of the two on both sides
  const above = LABEL_GAP + ABOVE_LIFT + LINE_HEIGHT + LABEL_SIZE + LABEL_MARGIN;
  const below = LABEL_GAP + BELOW_DROP + LINE_HEIGHT + DESCENT + LABEL_MARGIN;
  const cy = radius + Math.ceil(Math.max(above, below));
  const height = 2 * cy;
  return {width, height, cx, cy, radius, labels: labels.map((l, i) => place(l, i, count, radius, cx, cy, labelWidth))};
}
