// C4 Set 2: the award artwork (option B). The geometry is pure (utils/awardArt.ts) and checked here; the component
// (components/award-badge.tsx) and the medal that uses it are read as source, since a screen can't render under Node.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const art = await import('../utils/awardArt.ts');
const awards = await import('../utils/awards.ts');
const copy = await import('../utils/copy/awards.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const GLYPH_MAP: Record<string, number> = JSON.parse(read(
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'));

// every number in a path, as x y pairs
const coords = (d: string) => {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return nums;
};

describe('the frames', () => {
  test('one frame for every group, and each looks different', () => {
    assert.deepEqual(Object.keys(art.FRAMES).sort(), [...awards.AWARD_GROUPS].sort());
    const bodies = Object.values(art.FRAMES).map((fr) => fr.body);
    assert.equal(new Set(bodies).size, bodies.length);
  });

  test('every path is well formed and stays on the 100 x 120 grid', () => {
    const paths = [...Object.values(art.FRAMES).flatMap((fr) => [fr.body, fr.rim]), art.FLAME, art.FLAME_LEFT, art.FLAME_RIGHT,
      art.RIBBON_LEFT, art.RIBBON_RIGHT];
    for (const d of paths) {
      assert.match(d, /^M[-\d.\s LQCAZ]+$/, d.slice(0, 40));
      for (const n of coords(d)) assert.ok(Number.isFinite(n) && n >= -1 && n <= 121, `${n} in ${d.slice(0, 40)}`);
    }
  });

  test('the face fits inside every frame\'s rim', () => {
    assert.deepEqual({...art.FACE}, {cx: 50, cy: 60, r: 24});
    // the smallest rim radius among the round frames is 28 (comebacks); the face stays inside it
    assert.ok(art.FACE.r < 28);
  });

  test('the streak frame is the 1.0 medal\'s shield, ribbons and flame', () => {
    assert.equal(art.FRAMES.streaks.body, 'M50 20 L84 30 L84 60 Q84 88 50 104 Q16 88 16 60 L16 30 Z');
    assert.deepEqual([art.FRAMES.streaks.ribbons, art.FRAMES.streaks.flame], [true, true]);
  });

  test('the second flame sits either side of the first; the laurel has leaves on both sides', () => {
    const x = (d: string) => coords(d)[0];
    assert.equal(x(art.FLAME_LEFT), x(art.FLAME) - 13);
    assert.equal(x(art.FLAME_RIGHT), x(art.FLAME) + 13);
    assert.equal(art.LAUREL.length, 10);
    assert.ok(art.LAUREL.some((l) => l.cx < 50) && art.LAUREL.some((l) => l.cx > 50));
  });

  test('the generators: a star has 2n corners, a hexagon 6, a polygon closes', () => {
    assert.equal((art.starPath(50, 60, 40, 30, 8).match(/L/g) ?? []).length, 15);
    assert.equal((art.regularPolygon(50, 60, 40, 6).match(/L/g) ?? []).length, 5);
    assert.match(art.polygonPath([[0, 0], [1, 1], [2, 0]]), /Z$/);
  });
});

describe('the face of every award', () => {
  test('count awards show their number (1k for a thousand), at most 3 characters; the others a real glyph', () => {
    for (const award of awards.AWARDS) {
      const centre = art.awardCentre(award);
      if (centre.kind === 'number') {
        assert.ok(centre.text.length >= 1 && centre.text.length <= 3, `${award.id}: ${centre.text}`);
      } else {
        assert.ok(Object.hasOwn(GLYPH_MAP, centre.glyph), `${award.id}: ${centre.glyph}`);
      }
    }
    const find = (id: string) => art.awardCentre(awards.AWARDS.find((a) => a.id === id)!);
    assert.deepEqual(find('done_1000'), {kind: 'number', text: '1k'});
    assert.deepEqual(find('streak_365'), {kind: 'number', text: '365'});
    assert.deepEqual(find('comeback'), {kind: 'glyph', glyph: 'restore'});
    assert.deepEqual(find('steady_month'), {kind: 'glyph', glyph: 'calendar-month'});
  });

  test('three-character numbers are drawn smaller, so they stay on the face', () => {
    assert.equal(art.numberScale('7'), 0.28);
    assert.equal(art.numberScale('60'), 0.28);
    assert.equal(art.numberScale('365'), 0.21);
  });
});

describe('the badge component', () => {
  const src = code('components/award-badge.tsx');

  test('earned: the tier\'s light colour on a solid face, the ink colors.onAccent; locked: the dark locked face, muted ink', () => {
    assert.match(src, /const faceFill = earned \? metal\.light : medalTiers\.locked\.dark;/);
    assert.match(src, /const ink = earned \? colors\.onAccent : colors\.muted;/);
    assert.match(src, /<Circle cx=\{FACE\.cx\} cy=\{FACE\.cy\} r=\{FACE\.r\} fill=\{faceFill\}/);
    assert.match(src, /color: ink, fontSize: size \* numberScale\(centre\.text\)/);
    assert.doesNotMatch(src, /colors\.white|'white'/);
  });

  test('locked: the grey locked material and a lock under the face (never colour alone)', () => {
    assert.match(src, /const metal = earned \? medalTiers\[tier\] : medalTiers\.locked;/);
    assert.match(src, /\{!earned && \(\s*<View[^>]*>\s*<MaterialCommunityIcons name="lock"/);
  });

  test('the blaze glow, the second flame and the laurel', () => {
    assert.match(src, /const glow = earned && tier === 'blaze';/);
    assert.match(src, /ornament === 'secondFlame' \? \[FLAME_LEFT, FLAME_RIGHT\] : \[FLAME\]/);
    assert.match(src, /const laurel = frame\.laurel \|\| ornament === 'laurel';/);
  });

  test('purely visual: hidden from screen readers (the caller gives the label); unique SVG ids per badge', () => {
    assert.match(src, /importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/);
    assert.match(src, /const uid = useId\(\)\.replace\(\/\[\^A-Za-z0-9\]\/g, ''\);/);
    assert.match(src, /const bodyId = `award-\$\{uid\}-body`;/);
  });

  test('the number is RN Text in the app font, not scaled by the system font size (it must stay on the face)', () => {
    assert.match(src, /number: \{fontFamily: fonts\.title\}/);
    assert.match(src, /allowFontScaling=\{false\}/);
  });
});

describe('the medal uses it, and the shelf and the overlay use the medal', () => {
  test('the medal is the streak frame with its day count; its label and caption are the ones it always had', () => {
    const medal = code('components/medal.tsx');
    assert.match(medal, /<AwardBadge group="streaks" tier=\{tier\} earned=\{earned\} centre=\{\{kind: 'number', text: String\(days\)\}\} size=\{size\} \/>/);
    assert.match(medal, /accessibilityLabel=\{`\$\{days\}-day medal, \$\{earned \? 'earned' : `locked, \$\{daysToGoLabel\(daysToGo\)\}`\}`\}/);
    assert.match(medal, /\{earned \? `\$\{days\} days` : daysToGoLabel\(daysToGo\)\}/);
    assert.doesNotMatch(medal, /<Svg|react-native-svg|DARK_TEXT_TIERS|colors\.white/);// one drawing, in the badge
  });

  test('the Progress shelf and the celebration overlay draw the medal', () => {
    assert.match(code('components/progress/stats-blocks.tsx'), /<Medal days=\{m\.days\} tier=\{m\.tier\} earned=\{m\.earned\} daysToGo=\{m\.daysToGo\} \/>/);
    assert.match(code('components/celebration-overlay.tsx'), /<Medal days=\{item\.days\} tier=\{item\.tier\} earned daysToGo=\{0\} size=\{110\} \/>/);
  });

  test('the badge is drawn by the medal and the award tile only (Set 3 put the tile on Progress and /awards)', () => {
    for (const file of ['components/progress/stats-blocks.tsx', 'app/(tabs)/progress.tsx', 'app/(tabs)/index.tsx', 'utils/celebrations.ts']) {
      assert.doesNotMatch(code(file), /AwardBadge/, file);
    }
    assert.match(code('components/award-tile.tsx'), /<AwardBadge group=\{award\.group\}/);
  });
});

describe('spoken labels for awards (used by the Set 3 tiles)', () => {
  test('earned: name, material and state in words; locked: name, "locked" and the hint', () => {
    assert.equal(copy.awardSpokenLabel('perfect_run_7', 'gold', true, 0), 'Perfect week, gold award, earned.');
    assert.equal(copy.awardSpokenLabel('perfect_run_7', 'gold', false, 3), 'Perfect week, locked. 3 more perfect days in a row to go.');
    assert.equal(copy.awardSpokenLabel('steady_week', 'silver', false, null),
      'Steady week, locked. Tick at least 80% of your planned habits over 7 days.');
  });
});
