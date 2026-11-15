// C4 Set 1: the award table, its words, and the lines it must not cross: the six streak medals unchanged (days, XP,
// celebration), no XP for new awards, synced data only, never sent to the insight function, and Questy's voice rules.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const awards = await import('../utils/awards.ts');
const copy = await import('../utils/copy/awards.ts');
const gami = await import('../utils/gamification.ts');
const {MEDAL_TIERS} = await import('../utils/medals.ts');

type AwardId = import('../utils/awards.ts').AwardId;

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\/.*$/gm, '');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}
const IDS = awards.AWARDS.map((a) => a.id as string);

describe('the table', () => {
  test('35 awards, ids unique, lower-case ASCII, at most 32 characters', () => {
    assert.equal(awards.AWARDS.length, 35);
    assert.equal(new Set(IDS).size, IDS.length);
    for (const id of IDS) assert.match(id, /^[a-z][a-z0-9_]{0,31}$/, id);
  });

  test('the eight groups, every award in one; tiers are the six materials', () => {
    assert.deepEqual([...awards.AWARD_GROUPS], ['streaks', 'perfect', 'volume', 'consistency', 'comebacks', 'mastery', 'variety', 'time']);
    const counts = Object.fromEntries(awards.AWARD_GROUPS.map((g) => [g, awards.AWARDS.filter((a) => a.group === g).length]));
    assert.deepEqual(counts, {streaks: 8, perfect: 6, volume: 6, consistency: 4, comebacks: 1, mastery: 3, variety: 3, time: 4});
    for (const a of awards.AWARDS) assert.ok((MEDAL_TIERS as readonly string[]).includes(a.tier), a.id);
  });

  test('ornaments only on the two new streaks: a second flame at 200, a laurel at 365, both blaze', () => {
    const decorated = awards.AWARDS.filter((a) => a.ornament !== 'none').map((a) => [a.id, a.tier, a.ornament]);
    assert.deepEqual(decorated, [['streak_200', 'blaze', 'secondFlame'], ['streak_365', 'blaze', 'laurel']]);
  });

  test('the two dropped awards are not in the set', () => {
    for (const id of ['second_wind', 'comeback_3']) assert.ok(!IDS.includes(id), id);
  });

  test('the thresholds are the documented ones', () => {
    const n = (id: string) => {
      const rule = awards.AWARDS.find((a) => a.id === id)!.rule as {n?: number; days?: number; minScheduled?: number};
      return rule.n ?? `${rule.days}/${rule.minScheduled}`;
    };
    assert.deepEqual(['streak_200', 'streak_365', 'perfect_1', 'perfect_100', 'perfect_run_3', 'perfect_run_7', 'done_10', 'done_1000',
      'habit_streak_66', 'habits_5', 'areas_6', 'days_365', 'steady_week', 'steady_month'].map(n),
    [200, 365, 1, 100, 3, 7, 10, 1000, 66, 5, 6, 365, '7/7', '30/30']);
    assert.equal(awards.STEADY_SHARE, 0.8);
    assert.equal(awards.NEVER_TWICE_DAYS, 30);
    assert.equal(awards.NEVER_TWICE_MIN_SCHEDULED_DAYS, 20);
    assert.equal(awards.COMEBACK_GAP_DAYS, 4);
  });
});

describe('the six streak medals stay as they were', () => {
  test('their days and XP are unchanged (every phone derives XP and level from them)', () => {
    assert.deepEqual(gami.STREAK_MILESTONES.map((m) => [m.days, m.xp]), [[3, 5], [7, 10], [14, 20], [30, 40], [60, 80], [100, 160]]);
  });

  test('the medal awards are those six, with the tier the shelf has always used', () => {
    assert.deepEqual([...awards.MEDAL_AWARD_IDS], ['streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_60', 'streak_100']);
    for (const [i, m] of gami.STREAK_MILESTONES.entries()) {
      const a = awards.AWARDS.find((x) => x.id === `streak_${m.days}`)!;
      assert.deepEqual({n: (a.rule as {n: number}).n, tier: a.tier}, {n: m.days, tier: MEDAL_TIERS[i]});
    }
  });

  test('new awards give no XP: the XP sum never mentions them', () => {
    const src = code('utils/gamification.ts');
    assert.doesNotMatch(src, /award/i);
    assert.match(src, /const totalXp = completionXp \+ perfectDayXp \+ reflectionXp \+ bonusXp;/);
  });

  test('the celebrated-key formats are unchanged; awards get their own', () => {
    const celebrations = read('utils/celebrations.ts');
    assert.match(celebrations, /export const streakKey = \(days: number\) => `streak:\$\{days\}`;/);
    assert.match(celebrations, /export const levelKey = \(level: number\) => `level:v2:\$\{level\}`;/);
    assert.equal(awards.awardKey('perfect_run_7'), 'award:perfect_run_7');
  });
});

describe('synced data only, and never to the insight function', () => {
  test('the awards module reads no reflections, packs, area map, tick times or storage', () => {
    const src = code('utils/awards.ts');
    for (const banned of [/reflection/i, /packs/i, /areasStore|AreasMap/, /updatedAt/, /reminderTime/, /AsyncStorage|services\//]) {
      assert.doesNotMatch(src, banned, String(banned));
    }
  });

  test('the stats load hands it the synced rows only', () => {
    // the synced rows, and the XP code's longest streak and perfect days (neither depends on reflections)
    assert.match(code('services/gamificationStats.ts'),
      /awards: computeAwards\(rows\.habits, rows\.completions, today, \{longestStreak: gamification\.longestStreak, perfectDays: gamification\.perfectDays\}\),/);
  });

  test('nothing on the insight path imports or names the awards', () => {
    for (const file of ['utils/insightInput.ts', 'services/insightCache.ts', 'hooks/use-insight.ts', ...sourceFiles('functions/src')]) {
      let src = '';
      try { src = read(file); } catch { continue; }
      assert.doesNotMatch(src, /award|AWARD/, file);
    }
  });
});

describe('the words (Questy)', () => {
  test('every award has a name, an earned line and a how line; names are unique; the group labels are set', () => {
    assert.deepEqual(Object.keys(copy.AWARD_COPY).sort(), [...IDS].sort());
    const names = Object.values(copy.AWARD_COPY).map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(Object.keys(copy.AWARD_GROUP_LABELS), [...awards.AWARD_GROUPS]);
  });

  test('voice: one or two sentences, no emoji, at most one exclamation mark, no guilt words', () => {
    for (const id of IDS as AwardId[]) {
      const c = copy.AWARD_COPY[id];
      for (const line of [c.earned, c.how, copy.newAwardLine(id), copy.lockedHint(id, 3), copy.lockedHint(id, null)]) {
        assert.doesNotMatch(line, /\p{Extended_Pictographic}/u, `${id}: ${line}`);
        assert.ok((line.match(/!/g) ?? []).length <= 1, `${id}: ${line}`);
        assert.doesNotMatch(line, /\b(fail|failed|failure|lazy|should have|lost|shame|guilt|only|just)\b/i, `${id}: ${line}`);
      }
      const sentences = c.earned.split(/(?<=[.!?])\s+/).filter(Boolean);
      assert.ok(sentences.length >= 1 && sentences.length <= 2, `${id}: ${c.earned}`);
      assert.match(c.earned, /[.!]$/, id);
      assert.match(c.how, /\.$/, id);
    }
  });

  test('the approved samples', () => {
    assert.equal(copy.newAwardLine('perfect_run_7'), 'New award: Perfect week. Seven days, nothing missed.');
    assert.equal(copy.AWARD_COPY.comeback.earned, 'Back again. That counts for a lot.');
  });

  test('locked hints encourage with a count, or say what earns it', () => {
    assert.equal(copy.lockedHint('done_10', 10), 'Locked for now. 10 more ticks to go.');
    assert.equal(copy.lockedHint('perfect_7', 3), 'Locked for now. 3 more perfect days to go.');
    assert.equal(copy.lockedHint('perfect_7', 1), 'Locked for now. 1 more perfect day to go.');
    assert.equal(copy.lockedHint('steady_week', null), 'Locked for now. Tick at least 80% of your planned habits over 7 days.');
    assert.equal(copy.lockedHint('days_30', null), 'Locked for now. Stay with it for a month.');// no tick yet
  });

  test('the reviewed edits: a thousands comma, "in a row" for one habit, streak_7\'s line', () => {
    assert.deepEqual([0, 7, 999, 1000, 12345, 1000000].map(copy.formatCount), ['0', '7', '999', '1,000', '12,345', '1,000,000']);
    assert.equal(copy.lockedHint('done_1000', 1000), 'Locked for now. 1,000 more ticks to go.');
    assert.equal(copy.lockedHint('done_1000', 1), 'Locked for now. 1 more tick to go.');
    for (const id of ['habit_streak_7', 'habit_streak_30', 'habit_streak_66'] as const) {
      assert.equal(copy.lockedHint(id, 4), 'Locked for now. 4 more in a row to go.', id);
      assert.equal(copy.lockedHint(id, 1), 'Locked for now. 1 more in a row to go.', id);
    }
    assert.equal(copy.AWARD_COPY.streak_7.earned, 'A full week, every day. Nicely kept.');
    assert.doesNotMatch(code('utils/copy/awards.ts'), /toLocaleString/);// written by hand, not the phone's locale
  });

  test('pure: no React, native, Firebase or service imports', () => {
    assert.doesNotMatch(read('utils/copy/awards.ts'), /from ['"](react|react-native|expo|firebase|@\/services|@expo)/);
  });
});

describe('the celebration choice (pure; wired in Set 3)', () => {
  const none = new Set<string>();

  test('nothing new: nothing to show, nothing to mark (an update itself celebrates nothing)', () => {
    assert.deepEqual(awards.awardToToast(['done_10'], ['done_10'], none), {show: null, keys: []});
  });

  test('the six medals are the overlay\'s: never an award toast, never an award key', () => {
    assert.deepEqual(awards.awardToToast([], ['streak_3', 'streak_7'], none), {show: null, keys: []});
  });

  test('the highest tier is shown; every new one is marked so none comes up again', () => {
    assert.deepEqual(awards.awardToToast([], ['done_10', 'perfect_7'], none), {show: 'perfect_7', keys: ['award:perfect_7', 'award:done_10']});
  });

  test('a tie goes to the later award in the table', () => {
    assert.equal(awards.awardToToast([], ['done_10', 'perfect_1', 'comeback'], none).show, 'comeback');
  });

  test('already celebrated on this phone: left out', () => {
    assert.deepEqual(awards.awardToToast([], ['done_10'], new Set(['award:done_10'])), {show: null, keys: []});
  });

  test('the new streaks of 200 and 365 are awards (a toast), not medals', () => {
    assert.equal(awards.awardToToast([], ['streak_200'], none).show, 'streak_200');
  });
});
