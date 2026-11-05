// Stage 1b: Home's pack sections and choose card (utils/packs/home.ts), the pack picker (utils/packs/picker.ts)
// and their strings, checked against docs/PACKS_REPORTS_SPEC.md (sections 2b, 3 and 4).
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {Pack, PacksRecord, ParsedPacks} from '../utils/packs/record.ts';
import type {TemplateId} from '../utils/onboarding/types.ts';

const h = await import('../utils/packs/home.ts');
const p = await import('../utils/packs/picker.ts');
const pc = await import('../utils/packs/copy.ts');
const lim = await import('../utils/packs/limits.ts');
const r = await import('../utils/packs/record.ts');

const SPEC = readFileSync(new URL('../docs/PACKS_REPORTS_SPEC.md', import.meta.url), 'utf8');

function pack(id: Pack['builtinId'] & string, habitIds: string[], order: number, dropped: TemplateId[] = []): Pack {
  return {id, kind: 'builtin', builtinId: id, name: pc.PACK_NAMES[id], habitIds, dropped, createdAt: 1, order};
}
const ok = (...packs: Pack[]): ParsedPacks => ({kind: 'ok', record: {version: 1, packs}});
const row = (habitId: string, completed = 0) => ({habitId, completed});

describe('Home grouping', () => {
  const today = [row('w', 1), row('s'), row('b', 1), row('x'), row('y', 1)];
  const all = [
    {habitId: 'w', habitName: 'Walk for 20 minutes'}, {habitId: 's', habitName: 'Stretch for 10 minutes'},
    {habitId: 'b', habitName: 'Breathe for 5 minutes'}, {habitId: 'x', habitName: 'Read'}, {habitId: 'y', habitName: 'Gym'},
    {habitId: 'later', habitName: 'Drink water with each meal'},// packed, but not due today
  ];
  const parsed = ok(pack('calm_mind', ['b'], 1), pack('steady_energy', ['w', 's', 'later'], 0));

  test('packs in record order with their rows due today; a packed habit appears only inside its pack', () => {
    const g = h.homeGroups(parsed, today, all);
    assert.deepEqual(g.packs.map((s) => [s.packId, s.rows.map((x) => x.habitId), s.done]), [
      ['steady_energy', ['w', 's'], 1],
      ['calm_mind', ['b'], 1],
    ]);
    assert.deepEqual(g.unpacked.map((x) => x.habitId), ['x', 'y']);
    const shown = [...g.packs.flatMap((s) => s.rows), ...g.unpacked].map((x) => x.habitId).sort();
    assert.deepEqual(shown, today.map((x) => x.habitId).sort());// every row once, none twice
  });

  test('missing templates for "Add the rest" (card order, dropped left out); unknown when the habit read failed', () => {
    const g = h.homeGroups(parsed, today, all);
    assert.deepEqual(g.packs[0].missing, ['eat_produce']);// walk, stretch and water present
    assert.deepEqual(g.packs[1].missing, ['journal3', 'lights_out', 'screens_off']);
    const withDropped = h.homeGroups(ok(pack('calm_mind', ['b'], 0, ['lights_out'])), today, all);
    assert.deepEqual(withDropped.packs[0].missing, ['journal3', 'screens_off']);
    assert.equal(h.homeGroups(parsed, today, null).packs[0].missing, null);
  });

  test('a pack with nothing due today is still shown, with 0 rows', () => {
    const g = h.homeGroups(ok(pack('close_circle', ['zz'], 0)), today, all);
    assert.deepEqual(g.packs.map((s) => [s.packId, s.rows.length, s.done]), [['close_circle', 0, 0]]);
    assert.equal(g.unpacked.length, today.length);
    assert.equal(pc.packProgress(0, 0), 'Nothing scheduled today');
    assert.equal(pc.packProgress(1, 3), '1 of 3 done today');
  });

  test('no packs, an empty record, a corrupt one or one not read yet: everything unpacked, as before packs', () => {
    for (const state of [null, {kind: 'none'}, {kind: 'corrupt'}, ok()] as (ParsedPacks | null)[]) {
      const g = h.homeGroups(state, today, all);
      assert.deepEqual(g.packs, []);
      assert.deepEqual(g.unpacked, today);
    }
  });
});

describe('the choose card', () => {
  test('shown with at least one habit and no packs (none, empty, corrupt), unless "Not now"', () => {
    for (const parsed of [{kind: 'none'}, {kind: 'corrupt'}, ok()] as ParsedPacks[]) {
      assert.equal(h.showChooseCard({parsed, dismissed: false}, 1), true);
      assert.equal(h.showChooseCard({parsed, dismissed: true}, 1), false);
      assert.equal(h.showChooseCard({parsed, dismissed: false}, 0), false);
      assert.equal(h.showChooseCard({parsed, dismissed: false}, null), false);
    }
    assert.equal(h.showChooseCard({parsed: ok(pack('calm_mind', [], 0)), dismissed: false}, 5), false);
    assert.equal(h.showChooseCard(null, 5), false);// not read yet: nothing, rather than a card that may vanish
  });

  test('{n} is the pack limit for the level, never a fixed 2', () => {
    assert.equal(pc.chooseCardBody(lim.limitsForLevel(1).packs), 'Group your habits into up to 2 packs.');
    assert.equal(pc.chooseCardBody(lim.limitsForLevel(3).packs), 'Group your habits into up to 3 packs.');
    assert.equal(pc.chooseTitle(lim.limitsForLevel(5).packs), 'Pick up to 4 packs');
    for (const file of ['../components/packs/choose-packs-card.tsx', '../app/packs/choose.tsx', '../app/(tabs)/index.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /up to 2\b|chooseCardBody\(2\)|chooseTitle\(2\)/, file);
    }
  });
});

describe('the picker', () => {
  const pick = (over: Partial<Parameters<typeof p.togglePick>[0]>) =>
    p.togglePick({picked: [], id: 'calm_mind', owned: [], packCount: 0, level: 1, ...over});

  test('picks up to the level\'s pack limit, counting packs the user has; past it the pick is refused', () => {
    assert.deepEqual(pick({}), {picked: ['calm_mind'], limited: false});
    assert.deepEqual(pick({picked: ['study_sprint', 'steady_energy']}), {picked: ['study_sprint', 'steady_energy'], limited: true});
    assert.deepEqual(pick({picked: ['study_sprint'], owned: ['close_circle'], packCount: 1}), {picked: ['study_sprint'], limited: true});
    assert.deepEqual(pick({picked: ['study_sprint', 'steady_energy'], level: 3}).picked, ['steady_energy', 'calm_mind', 'study_sprint']);
    assert.equal(pick({picked: ['study_sprint', 'steady_energy'], level: 3}).limited, false);
  });

  test('unpicking is always allowed; an owned pack never changes here', () => {
    assert.deepEqual(pick({picked: ['calm_mind', 'study_sprint']}), {picked: ['study_sprint'], limited: false});
    assert.deepEqual(pick({owned: ['calm_mind'], packCount: 1}), {picked: [], limited: false});
    assert.deepEqual(pick({picked: ['calm_mind', 'study_sprint'], level: 1, packCount: 5}).picked, ['study_sprint']);// above the limit: can still unpick
  });

  test('the limit message names the next level with more packs', () => {
    assert.equal(pc.packLimitMessage(lim.nextLimitLevel(1, 'packs')), 'Pack limit reached. Reach level 3 to add more habit packs.');
    assert.equal(pc.packLimitMessage(lim.nextLimitLevel(4, 'packs')), 'Pack limit reached. Reach level 5 to add more habit packs.');
  });

  test('saving adds the new packs after the existing ones and adopts same-named unpacked habits', () => {
    const habits = [
      {habitId: 'a', habitName: '  breathe   FOR 5 minutes '},
      {habitId: 'b', habitName: 'Breathe for 5 minutes'},// a second one: only the first joins
      {habitId: 'c', habitName: 'Write 3 lines in a journal'},
      {habitId: 'd', habitName: 'Walk for 20 minutes'},// already in Steady Energy
      {habitId: 'e', habitName: 'Make your bed'},
    ];
    const parsed = ok(pack('steady_energy', ['d'], 4));
    const next = p.packsAfterPick(parsed, ['calm_mind', 'daily_discipline'], habits, 99)!;
    assert.deepEqual(next.packs.map((x) => [x.id, x.habitIds, x.order, x.createdAt]), [
      ['steady_energy', ['d'], 4, 1],
      ['calm_mind', ['a', 'c'], 5, 99],
      ['daily_discipline', ['e'], 6, 99],
    ]);
    assert.equal(r.parsePacks(r.serialisePacks(next)).kind, 'ok');
  });

  test('from no record, an empty one or a corrupt one; nothing new saves nothing; owned packs are skipped', () => {
    for (const parsed of [{kind: 'none'}, {kind: 'corrupt'}, ok()] as ParsedPacks[]) {
      const next = p.packsAfterPick(parsed, ['close_circle'], [], 5) as PacksRecord;
      assert.deepEqual(next.packs.map((x) => [x.id, x.name, x.order]), [['close_circle', 'Close Circle', 0]]);
    }
    assert.equal(p.packsAfterPick(ok(pack('calm_mind', [], 0)), [], [], 5), null);
    assert.equal(p.packsAfterPick(ok(pack('calm_mind', [], 0)), ['calm_mind'], [], 5), null);
    assert.deepEqual(p.ownedBuiltins(ok(pack('study_sprint', [], 1), pack('calm_mind', [], 0))), ['calm_mind', 'study_sprint']);
    assert.deepEqual(p.ownedBuiltins({kind: 'corrupt'}), []);
  });
});

describe('first render', () => {
  test('Home reads packs synchronously from the store (the startup mirror), and reads storage only after home:usable', () => {
    const hook = readFileSync(new URL('../hooks/use-packs.ts', import.meta.url), 'utf8');
    assert.match(hook, /useSyncExternalStore\(packsStore\.subscribe/);
    assert.match(hook, /packsStore\.peek\(uid\)/);
    assert.match(hook, /homeUsable\.on\(\(\) => \{\s*packsStore\.read\(uid\)/);
    const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
    assert.match(home, /const packs = usePacks\(userId\)/);
    assert.match(home, /homeGroups\(packs\?\.parsed \?\? null, habits, list\.all\)/);
  });
});

describe('strings', () => {
  test('the Home section names and progress line are the spec\'s (section 4)', () => {
    const home = SPEC.split(/\r?\n(?=## )/).find((s) => s.startsWith('## 4.'))!;
    for (const text of [pc.HOME_PACKS_TITLE, pc.HOME_HABITS_TITLE, pc.NOTHING_TODAY, pc.CHOOSE_CARD_TITLE, pc.CHOOSE_CARD_LATER, pc.SETTINGS_PACKS_ROW]) {
      assert.ok(home.includes(`"${text}"`), text);
    }
    assert.ok(home.includes('"{x} of {n} done today"'));
    assert.equal(pc.habitCount(4), '4 habits');
  });
});
