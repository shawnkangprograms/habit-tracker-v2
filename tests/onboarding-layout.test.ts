// Onboarding text fits its space (utils/onboarding/layout.ts, utils/onboarding/radar.ts), with the conservative
// width estimate: the radar labels stay inside the drawing area on screens 300 to 430 dp wide, and every routine
// card name fits in two lines on a 360 dp screen. Larger system font sizes are a phone check, not covered here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below

const layout = await import('../utils/onboarding/layout.ts');
const radar = await import('../utils/onboarding/radar.ts');
const c = await import('../utils/onboarding/copy.ts');
const t = await import('../utils/onboarding/types.ts');

const labelWidth = (text: string) => layout.textWidth(text, radar.LABEL_SIZE);
const SCREENS = Array.from({length: 431 - 300}, (_, i) => 300 + i);// every whole width from 300 to 430

describe('radar labels', () => {
  test('every label stays inside the drawing area, with the margin, at every screen width from 300 to 430', () => {
    for (const screen of SCREENS) {
      const fit = radar.fitRadar(screen - 2 * layout.SCREEN_PADDING, t.AXES, labelWidth);
      const m = radar.LABEL_MARGIN;
      assert.ok(fit.radius > 40, `${screen}: radius ${fit.radius}`);
      for (const l of fit.labels) {
        const where = `${screen} dp, ${l.text}: ${JSON.stringify(l)} in ${fit.width}x${fit.height}`;
        assert.ok(l.left >= m - 1e-9 && l.right <= fit.width - m + 1e-9, where);
        assert.ok(l.top >= m - 1e-9 && l.bottom <= fit.height - m + 1e-9, where);
      }
    }
  });

  test('Relations and Discipline at both ends of the range', () => {
    for (const screen of [300, 430]) {
      const fit = radar.fitRadar(screen - 2 * layout.SCREEN_PADDING, t.AXES, labelWidth);
      const relations = fit.labels.find((l) => l.text === 'Relations')!;
      const discipline = fit.labels.find((l) => l.text === 'Discipline')!;
      assert.equal(relations.anchor, 'end');// left side, growing away from the shape
      assert.ok(relations.left >= radar.LABEL_MARGIN, `${screen}: Relations starts at ${relations.left}`);
      assert.equal(discipline.anchor, 'middle');// bottom, centred
      assert.ok(discipline.left >= radar.LABEL_MARGIN && discipline.right <= fit.width - radar.LABEL_MARGIN, `${screen}: Discipline`);
      assert.ok(discipline.bottom <= fit.height - radar.LABEL_MARGIN, `${screen}: Discipline below`);
    }
  });

  test('the centre is the middle of the area (the score layer scales about its view centre)', () => {
    const fit = radar.fitRadar(328, t.AXES, labelWidth);
    assert.equal(fit.cx, fit.width / 2);
    assert.equal(fit.cy, fit.height / 2);
    assert.ok(fit.radius <= radar.RADIUS_MAX);
  });

  test('a wider label shrinks the radius instead of leaving the area', () => {
    const labels = t.AXES.map((a) => (a === 'Relations' ? 'Relationships' : a));
    const normal = radar.fitRadar(268, t.AXES, labelWidth);
    const fit = radar.fitRadar(268, labels, labelWidth);
    const long = fit.labels.find((l) => l.text === 'Relationships')!;
    assert.ok(fit.radius < normal.radius);
    assert.ok(long.left >= radar.LABEL_MARGIN - 1e-9);
  });

  test('the estimate is never below the measured widths of the labels (Inter SemiBold, 12 px)', () => {
    // measured from the installed font file: advance widths in em
    const measured: Record<string, number> = {
      Learning: 4.239, Mind: 2.42, Career: 3.288, Discipline: 4.728, Relations: 4.464, Health: 3.138,
    };
    for (const axis of t.AXES) assert.ok(labelWidth(axis) >= measured[axis] * radar.LABEL_SIZE, axis);
  });
});

// The ten Stage 1 templates (docs/PACKS_REPORTS_SPEC.md, section 1): not in the catalog yet, checked now so the
// card already fits them
const STAGE1_NAMES = [
  'Eat one fruit or vegetable', 'Make your bed', 'Tidy your space for 5 minutes', "Set out tomorrow's essentials",
  'Track one work win', 'Reach out to one contact', 'Read for 15 minutes', 'Teach what you learned',
  'Thank someone today', 'Do one kind thing',
];

describe('routine card names', () => {
  test('every catalog, replace and Stage 1 name fits in two lines on a 360 dp screen', () => {
    const width = layout.routineNameWidth(360);
    assert.ok(width > 150, `name width ${width}`);
    const names = [...Object.values(c.TEMPLATE_NAMES), ...Object.values(c.REPLACE_NAMES), ...STAGE1_NAMES, c.OWN_HABIT_REASON];
    for (const name of names) {
      const lines = layout.wrappedLines(name, width, layout.ROUTINE_CARD.nameSize);
      assert.ok(lines <= layout.ROUTINE_NAME_LINES, `${name}: ${lines} lines in ${width} px`);
    }
  });

  test('the card component uses these numbers', () => {
    const source = readFileSync(new URL('../components/onboarding/routine-card.tsx', import.meta.url), 'utf8');
    assert.match(source, /numberOfLines=\{ROUTINE_NAME_LINES\}/);
    for (const key of ['gap', 'padding', 'badge', 'slot', 'nameSize']) assert.match(source, new RegExp(`ROUTINE_CARD\\.${key}`), key);
  });

  test('wrappedLines: greedy word wrap', () => {
    const w = layout.textWidth('aaaa', 10);// exactly four characters per line
    assert.equal(layout.wrappedLines('aaaa', w, 10), 1);
    assert.equal(layout.wrappedLines('aa aa', w, 10), 2);// "aa aa" is five characters
    assert.equal(layout.wrappedLines('a a a', w, 10), 2);
    assert.equal(layout.wrappedLines('aaaaaaaaa', w, 10), 3);// one long word
  });
});

describe('titles', () => {
  test('every 28 px Space Grotesk title has a line height of at least the font\'s natural 35.7 px', () => {
    const files = [
      '../app/onboarding.tsx', '../components/onboarding/told-us.tsx', '../components/onboarding/habit-profile.tsx',
      '../components/onboarding/building-profile.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const titles = source.split(/\r?\n/).filter((l) => /fontFamily: fonts\.title, fontSize: 28\b/.test(l));
      assert.ok(titles.length > 0, file);
      for (const line of titles) {
        const lh = Number(/lineHeight: (\d+)/.exec(line)?.[1]);
        assert.ok(lh >= 36, `${file}: ${line.trim()}`);
        assert.doesNotMatch(line, /\bheight:/, file);
      }
    }
  });
});
