// C4 Set 3: the Awards section on Progress, the /awards screen and the award toast. The pure parts (what the section
// picks, the toast choice and how it joins a tick's items) are tested directly; the screens and the celebration hook
// are read as source, since a screen can't render under Node's runner.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const awards = await import('../utils/awards.ts');
const celebrations = await import('../utils/celebrations.ts');
const copy = await import('../utils/copy/awards.ts');
const ids = await import('../constants/testIds.ts');

type AwardState = import('../utils/awards.ts').AwardState;

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// every award locked with nothing done, then the given ones changed
function states(over: Record<string, Partial<AwardState>> = {}): AwardState[] {
  return awards.AWARDS.map((a) => {
    const n = (a.rule as {n?: number}).n;
    return {id: a.id, earned: false, remaining: typeof n === 'number' ? n : null, ...over[a.id]};
  });
}

describe('the Awards section: the next three to earn', () => {
  test('nearest to done first, by the share already done (2 of 3 before 5 of 10)', () => {
    const next = awards.nextToEarn(states({streak_3: {remaining: 1}, done_10: {remaining: 5}, perfect_7: {remaining: 6}}));
    assert.deepEqual(next.map((v) => v.id), ['streak_3', 'done_10', 'perfect_7']);
  });

  test('earned ones are left out; then the other count awards, then the ones that aren\'t counts, in table order', () => {
    const all = states();
    const earnedAllButTwo = all.map((s) => ({...s, earned: !['comeback', 'days_7'].includes(s.id)}));
    assert.deepEqual(awards.nextToEarn(earnedAllButTwo).map((v) => v.id), ['days_7', 'comeback']);// a count (0 of 7) before a non-count
    // nothing done anywhere: every count share is 0, so the table order decides
    assert.deepEqual(awards.nextToEarn(all).map((v) => v.id), ['streak_3', 'streak_7', 'streak_14']);
  });

  test('every award earned: nothing next (the section says so)', () => {
    assert.deepEqual(awards.nextToEarn(states().map((s) => ({...s, earned: true}))), []);
    assert.equal(copy.ALL_EARNED_LINE, 'You have earned every award. That is a lot of showing up.');
  });

  test('the /awards screen groups every award, in the groups\' order', () => {
    const grouped = awards.awardsByGroup(states());
    assert.deepEqual(grouped.map((g) => g.group), [...awards.AWARD_GROUPS]);
    assert.equal(grouped.reduce((sum, g) => sum + g.awards.length, 0), 35);
    assert.ok(grouped.every((g) => g.awards.every((a) => a.group === g.group)));
  });

  test('an award missing from the stats shows as locked, with no count', () => {
    const views = awards.awardViews([]);
    assert.equal(views.length, 35);
    assert.ok(views.every((v) => !v.state.earned && v.state.remaining === null));
  });
});

describe('the award toast', () => {
  const none = new Set<string>();
  const held = (ids: string[]) => states(Object.fromEntries(ids.map((id) => [id, {earned: true}])));

  test('silent backfill: with no awards before the tick (an older entry, the first stats of an install) nothing is shown or marked', () => {
    assert.deepEqual(awards.awardFromTick(undefined, held(['done_10', 'perfect_7', 'comeback']), none), {show: null, keys: []});
    assert.deepEqual(awards.awardFromTick(held(['done_10']), undefined, none), {show: null, keys: []});
  });

  test('silent backfill: awards already held at launch are never shown by a later tick that earns nothing new', () => {
    const atLaunch = held(['done_10', 'perfect_7', 'comeback']);
    assert.deepEqual(awards.awardFromTick(atLaunch, atLaunch, none), {show: null, keys: []});
  });

  test('a tick that earns one: shown and marked; the celebrated keys unknown: held (nothing shown or marked)', () => {
    assert.deepEqual(awards.awardFromTick(held(['done_10']), held(['done_10', 'perfect_7']), none), {show: 'perfect_7', keys: ['award:perfect_7']});
    assert.deepEqual(awards.awardFromTick(held([]), held(['perfect_7']), null), {show: null, keys: []});
  });

  test('never for the six medals (they keep the overlay)', () => {
    assert.deepEqual(awards.awardFromTick(held([]), held(['streak_3', 'streak_7']), none), {show: null, keys: []});
  });

  test('the text: "New award: <name>. <earned line>"', () => {
    assert.equal(copy.newAwardLine('perfect_run_7'), 'New award: Perfect week. Seven days, nothing missed.');
  });

  const picker = celebrations.createMessagePicker();
  const vars = {d: 1, h: 0, xp: 2, level: 2, toNext: 50, m: null, reachedLevel: 2, milestone: 0, tier: 'bronze', firstMedal: true} as never;

  test('no award: the tick\'s items are exactly what they were', () => {
    let id = 0;
    const a = celebrations.tickItemsWithAward([], 'Nice one.', null, vars, picker, () => ++id);
    id = 0;
    assert.deepEqual(a, celebrations.tickItems([], 'Nice one.', vars, picker, () => ++id));
  });

  test('an award takes the toast slot: it replaces the encouragement toast, one toast only', () => {
    let id = 0;
    const items = celebrations.tickItemsWithAward([], 'Nice one.', 'New award: 10 ticks. Ten habits done.', vars, picker, () => ++id);
    assert.deepEqual(items.map((i) => [i.kind, (i as {text?: string}).text]), [['toast', 'New award: 10 ticks. Ten habits done.']]);
  });

  test('with a celebration, the award toast follows it (the queue shows one at a time)', () => {
    let id = 0;
    const items = celebrations.tickItemsWithAward([{kind: 'levelUp', level: 3}], null, 'New award: 10 ticks. Ten habits done.', vars, picker, () => ++id);
    assert.deepEqual(items.map((i) => i.kind), ['levelUp', 'toast']);
  });
});

describe('the celebration hook', () => {
  const hook = code('hooks/use-celebrations.ts');

  test('the award is worked out inside the tick handler only, after a real completing tick, from the entry before it', () => {
    const tick = hook.slice(hook.indexOf('const handleTick = useCallback'), hook.indexOf('const onTick = useCallback'));
    assert.match(tick, /if \(!userId \|\| !getCelebrationsEnabled\(\)\) return;/);// the celebrations setting
    assert.ok(tick.indexOf('awardFromTick(') > tick.indexOf('if (!diff) return;'), 'after the diff: an un-tick or a load earns nothing');
    assert.match(tick, /const award = awardFromTick\(\(result\.published\.previous\.stats as TickStatsValue\)\.awards, result\.snapshot\.stats\.awards, celebrated\);/);
    assert.match(tick, /keys\.push\(\.\.\.award\.keys\);/);
    assert.match(tick, /const items = tickItemsWithAward\(celebrations, toast, awardText, vars, picker, \(\) => \+\+lastId\.current\)/);
    assert.match(tick, /setQueue\(\(q\) => enqueue\(q, items\)\)/);// the one-at-a-time queue
  });

  test('an award outranks encouragement: no early read, no situation toast, and an older tap still queues it', () => {
    assert.match(hook, /repeats\.length === 0 && awardText === null && isLatest\(\)/);
    assert.match(hook, /const situation = celebrations\.length === 0 && awardText === null \? pickSituation/);
    assert.match(hook, /if \(celebrations\.length === 0 && awardText === null && !isLatest\(\)\) \{/);
  });

  test('a saved reflection never gives an award toast; nothing outside the hook does', () => {
    const reflection = hook.slice(hook.indexOf('const handleReflection = useCallback'));
    assert.doesNotMatch(reflection, /award/i);
    for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/progress.tsx', 'app/awards.tsx', 'services/gamificationStats.ts']) {
      assert.doesNotMatch(code(file), /awardFromTick|awardToToast|newAwardLine/, file);
    }
  });
});

describe('the screens', () => {
  test('Progress: the Awards section after the medals and lifetime, from the stats it already has', () => {
    const progress = code('app/(tabs)/progress.tsx');
    assert.ok(progress.indexOf('<AwardsSection') > progress.indexOf('<MedalsAndLifetime'));
    assert.match(progress, /\{stats && <AwardsSection awards=\{stats\.awards\} \/>\}/);
  });

  test('the section: its title, the earned count, the next three, "See all awards" to /awards', () => {
    const section = code('components/progress/awards-section.tsx');
    assert.match(section, /<Text style=\{sectionTitleStyle\} accessibilityRole="header">\{AWARDS_SECTION_TITLE\}<\/Text>/);
    assert.match(section, /\{earnedCountLine\(earned, AWARDS\.length\)\}/);
    assert.match(section, /const next = nextToEarn\(awards\);/);
    assert.match(section, /<AwardTile key=\{award\.id\} award=\{award\} row \/>/);
    assert.match(section, /<Button label=\{SEE_ALL_AWARDS\} variant="secondary" size="md" onPress=\{\(\) => router\.push\('\/awards'\)\} testID=\{TEST_IDS\.awards\.seeAll\} \/>/);
  });

  test('/awards: its test id, a back row, the title, a header per group with its test id, a tile per award', () => {
    const screen = code('app/awards.tsx');
    assert.match(screen, /<Screen testID=\{TEST_IDS\.awards\.screen\}/);
    assert.match(screen, /testID=\{TEST_IDS\.awards\.back\}/);
    assert.match(screen, /\{AWARDS_SCREEN_TITLE\}/);
    assert.match(screen, /accessibilityRole="header" testID=\{awardGroupId\(group\)\}>\{AWARD_GROUP_LABELS\[group\]\}/);
    assert.match(screen, /<AwardTile key=\{award\.id\} award=\{award\} \/>/);
    assert.match(screen, /const \{stats, failed\} = useProgressStats\(\);/);// the shared stats, not a new load
    assert.match(screen, /\{!awards && failed && <AppText[^>]*>\{AWARDS_FAILED_LINE\}<\/AppText>\}/);
    assert.match(code('app/_layout.tsx'), /<Stack\.Screen name="awards" options=\{\{headerShown: false\}\} \/>/);
  });

  test('a tile: one item for screen readers, its spoken label, its test id; locked shows the hint, earned the line', () => {
    const tile = code('components/award-tile.tsx');
    assert.match(tile, /accessible\s+accessibilityLabel=\{awardSpokenLabel\(award\.id, award\.tier, state\.earned, state\.remaining\)\}\s+testID=\{awardTileId\(award\.id\)\}/);
    assert.match(tile, /\{state\.earned \? copy\.earned : lockedHint\(award\.id, state\.remaining\)\}/);
    assert.doesNotMatch(tile, />[A-Za-z][^<{]*</);// no words written in the tile
  });

  test('no words written in the section or the screen: every string from utils/copy/', () => {
    for (const file of ['components/progress/awards-section.tsx', 'app/awards.tsx']) assert.doesNotMatch(code(file), />[A-Za-z][^<{]*</, file);
  });
});

describe('test ids and words', () => {
  test('award-<id> and awards-group-<group> in kebab-case, unique; the screen, see-all and back ids', () => {
    assert.equal(ids.awardTileId('perfect_run_7'), 'award-perfect-run-7');
    assert.equal(ids.awardGroupId('streaks'), 'awards-group-streaks');
    assert.deepEqual(ids.TEST_IDS.awards, {screen: 'awards-screen', seeAll: 'awards-see-all', back: 'awards-back'});
    const every = [...awards.AWARDS.map((a) => ids.awardTileId(a.id)), ...awards.AWARD_GROUPS.map(ids.awardGroupId), ...Object.values(ids.TEST_IDS.awards)];
    assert.equal(new Set(every).size, every.length);
    for (const id of every) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
  });

  test('the section and screen words', () => {
    assert.deepEqual([copy.AWARDS_SECTION_TITLE, copy.earnedCountLine(12, 35), copy.NEXT_UP_TITLE, copy.SEE_ALL_AWARDS, copy.AWARDS_SCREEN_TITLE, copy.AWARDS_BACK],
      ['Awards', '12 of 35 earned', 'Next up', 'See all awards', 'Awards.', 'Progress']);
    assert.equal(copy.AWARDS_FAILED_LINE, "Your awards couldn't be loaded. They'll try again next time you open this screen.");
  });

  test('the route: Progress pushes /awards, which is a file under app/', () => {
    assert.ok(readFileSync(join(ROOT, 'app/awards.tsx'), 'utf8').length > 0);
    assert.match(code('app/awards.tsx'), /router\.replace\('\/progress'\)/);
  });
});

describe('/awards is a virtualised list (the Itel)', () => {
  test('the groups become sections of two-tile rows: every award once, in order, keys stable and unique', () => {
    const sections = awards.awardSections(awards.awardsByGroup(states()));
    assert.deepEqual(sections.map((s) => s.group), [...awards.AWARD_GROUPS]);
    const flat = sections.flatMap((s) => s.data.flatMap((row) => row.awards.map((a) => a.id)));
    assert.deepEqual(flat, awards.AWARDS.map((a) => a.id));
    for (const s of sections) for (const row of s.data) assert.ok(row.awards.length >= 1 && row.awards.length <= awards.AWARDS_PER_ROW);
    const keys = sections.flatMap((s) => s.data.map((row) => row.key));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(sections.find((s) => s.group === 'comebacks')!.data[0].key, 'comeback');// a group of one: one row of one
    assert.equal(awards.AWARDS_PER_ROW, 2);// two tiles a row: each tile is 50% wide (components/award-tile.tsx)
    assert.match(code('components/award-tile.tsx'), /tile: \{width: '50%'/);
  });

  test('a SectionList inside a non-scrolling Screen, few rows at first, no sticky headers, the header in the list', () => {
    const screen = code('app/awards.tsx');
    assert.match(screen, /<Screen testID=\{TEST_IDS\.awards\.screen\} scroll=\{false\}/);
    assert.doesNotMatch(screen, /<ScrollView/);
    assert.match(screen, /<SectionList\s/);
    assert.match(screen, /sections=\{sections\}/);
    assert.match(screen, /const sections = awards \? awardSections\(awardsByGroup\(awards\)\) : \[\];/);
    assert.match(screen, /initialNumToRender=\{INITIAL_ROWS\}/);
    assert.match(screen, /const INITIAL_ROWS = 4;/);
    assert.match(screen, /maxToRenderPerBatch=\{INITIAL_ROWS\}/);
    assert.match(screen, /windowSize=\{5\}/);
    assert.match(screen, /removeClippedSubviews/);
    assert.match(screen, /stickySectionHeadersEnabled=\{false\}/);
    assert.match(screen, /keyExtractor=\{\(row\) => row\.key\}/);
    assert.match(screen, /renderSectionHeader=\{\(\{section\}\) => <GroupHeader group=\{section\.group\} \/>\}/);
    assert.match(screen, /ListHeaderComponent=\{header\}/);
  });

  test('rows and tiles are memoised, so a scroll never redraws a badge already drawn', () => {
    assert.match(code('app/awards.tsx'), /const TileRow = memo\(function TileRow/);
    assert.match(code('app/awards.tsx'), /renderItem=\{\(\{item\}\) => <TileRow row=\{item\} \/>\}/);
    assert.match(code('components/award-tile.tsx'), /export const AwardTile = memo\(function AwardTile/);
    assert.match(code('components/award-badge.tsx'), /export const AwardBadge = memo\(function AwardBadge/);
  });

  test('the back row, title, count and failure line ride in the list header; the reading of shared stats is unchanged', () => {
    const screen = code('app/awards.tsx');
    const header = screen.slice(screen.indexOf('const header = ('), screen.indexOf('return (\n    <Screen'));
    for (const piece of ['TEST_IDS.awards.back', '{AWARDS_SCREEN_TITLE}', '{AWARDS_FAILED_LINE}', 'earnedCountLine(earned, AWARDS.length)']) {
      assert.ok(header.includes(piece), piece);
    }
    assert.match(screen, /const \{stats, failed\} = useProgressStats\(\);/);
  });
});
