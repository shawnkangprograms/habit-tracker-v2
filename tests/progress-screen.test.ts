// Stage C2, Set 2 (Progress): the old Summary and Profile screens are one screen, Home's radar card is gone (there is one
// radar in the app: Progress's), and the tab bar has three tabs. A screen can't be rendered under Node's runner, so this
// reads the source: which files and routes are gone, the order of the layout, that each half still loads on its own, that
// every element of the old screens landed somewhere, and that the words are the ones the old screens had.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './helpers/alias.ts'; // must come before the dynamic imports below

const copy = await import('../utils/copy/progress.ts');
const ids = await import('../constants/testIds.ts');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const exists = (path: string) => existsSync(join(ROOT, path));
const code = (path: string) => read(path).replace(/\/\/.*$/gm, '');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}
const APP_FILES = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('hooks'), ...sourceFiles('services')];
const at = (source: string, needle: string) => {
  const i = source.indexOf(needle);
  assert.ok(i >= 0, `missing: ${needle}`);
  return i;
};

describe('files and routes removed in the same change as the new screen', () => {
  test('the Summary and Profile routes, Home\'s radar card and its Week/Month switch are gone', () => {
    for (const file of ['app/(tabs)/summary.tsx', 'app/(tabs)/profile.tsx', 'components/radar/radar-card.tsx', 'components/radar/window-switch.tsx']) {
      assert.equal(exists(file), false, file);
    }
    assert.ok(exists('app/(tabs)/progress.tsx'));
  });

  test('the tab layout declares exactly index, progress and you, and each has a file (SDK 57 adds a tab for any file)', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['index', 'progress', 'you']);
    const files = readdirSync(join(ROOT, 'app/(tabs)')).filter((f) => f !== '_layout.tsx').map((f) => f.replace(/\.tsx$/, '')).sort();
    assert.deepEqual(files, ['index', 'progress', 'you']);
  });

  test('Progress is the tab with the streak flame and its count; its test id replaces tab-summary and tab-profile', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    assert.match(layout, /name="progress"\s+options=\{\{\s+title: 'Progress',\s+tabBarButtonTestID: TEST_IDS\.tabs\.progress,[\s\S]*?<StreakTabIcon color=\{color\} \/>/);
    assert.equal((layout.match(/StreakTabIcon/g) ?? []).length, 2);// the import and the one use
    assert.deepEqual(ids.TEST_IDS.tabs, {today: 'tab-today', progress: 'tab-progress', you: 'tab-you'});
  });

  test('nothing navigates to /summary or /profile any more, and the notification tap still opens Home', () => {
    for (const file of APP_FILES) assert.doesNotMatch(code(file), /['"`]\/(summary|profile)['"`]/, file);
    assert.match(read('services/notifications.ts'), /router\.navigate\('\/'\)/);
    assert.ok(exists('app/(tabs)/index.tsx'));
    assert.match(read('app/(tabs)/_layout.tsx'), /<Tabs\.Screen\s+name="index"/);
  });
});

describe('Home after the radar left', () => {
  const home = read('app/(tabs)/index.tsx');

  test('no radar card, radar window or link to Summary on Home', () => {
    assert.doesNotMatch(code('app/(tabs)/index.tsx'), /RadarCard|use-radar-window|useRadarWindow|setRadarWindow|openSummary/);
  });

  test('the greeting is followed by an empty 20 dp space for the goal sentence, with no text in it', () => {
    assert.match(home, /const GOAL_SLOT_HEIGHT = 20;/);
    assert.match(home, /goalSlot: \{height: GOAL_SLOT_HEIGHT\}/);
    assert.match(home, /<View style=\{styles\.goalSlot\} \/>/);
    assert.ok(at(home, '<View style={styles.goalSlot} />') > at(home, '{greetingFor(currentHour(), firstName)}'));
    assert.ok(at(home, '<View style={styles.goalSlot} />') < at(home, '<StatsCard'));
  });

  test('Home keeps the stats card, insight card, packs, habit lists, reflection bar and celebrations', () => {
    for (const piece of ['<StatsCard', '<InsightCard', '<ChoosePacksCard', '<PackCard', '<ReflectionBar', '<CelebrationLayer', '<EmptyHomeCard', '<ReminderPrompt']) {
      assert.ok(home.includes(piece), piece);
    }
  });
});

describe('Progress: layout top to bottom', () => {
  const screen = read('app/(tabs)/progress.tsx');
  const section = read('components/progress/summary-section.tsx');
  const blocks = read('components/progress/stats-blocks.tsx');

  test('title, stats failure line, level and streak, the summary, then medals and lifetime', () => {
    const order = ['{PROGRESS_TITLE}', '{STATS_FAILED_LINE}', '<LevelAndStreak', '<SummarySection />', '<MedalsAndLifetime'].map((n) => at(screen, n));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(screen, /<Text style=\{styles\.title\} accessibilityRole="header">\{PROGRESS_TITLE\}<\/Text>/);
    assert.match(screen, /<Screen padding=\{spacing\.lg\} gap=\{spacing\.s10\} contentStyle=\{styles\.content\}>/);
  });

  test('the summary: failure line, empty cards, toggle, stats, days chart, radar (title, Strongest and Needs care, drawing), by habit', () => {
    const body = section.slice(at(section, '  return (\n    <>'));// the markup, after the imports
    const order = ['SUMMARY_FAILED_LINE', 'kind="noHabits"', '<RangeToggle', 'kind="nothingScheduled"', '<SummaryStats', 'LAST_7_DAYS_TITLE',
      '<WeekBars', '<HeatStrip', '{RADAR_TITLE}', '<RadarHighlights', '<RadarSummary', '{BY_HABIT_TITLE}', '<HabitRateList'].map((n) => at(body, n));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  test('the level card and the streak card keep their numbers, labels and accessible text', () => {
    assert.match(blocks, /<LevelBadge level=\{stats\.level\} size=\{56\} \/>/);
    assert.match(blocks, /<XpBar progress=\{stats\.progress\} xpIntoLevel=\{stats\.xpIntoLevel\} xpForNextLevel=\{stats\.xpForNextLevel\} \/>/);
    assert.match(blocks, /accessibilityLabel=\{streakA11yLabel\(stats\.currentStreak, stats\.longestStreak\)\}/);
    assert.match(blocks, /<MaterialCommunityIcons name="fire" size=\{40\} color=\{colors\.accent\} \/>/);
  });

  test('medals (the shelf with its entrance animation, reduce-motion safe) and the three lifetime tiles', () => {
    assert.match(blocks, /entering=\{FadeInDown\.duration\(250\)\.delay\(i \* 50\)\.reduceMotion\(ReduceMotion\.System\)\}/);
    assert.match(blocks, /<Medal days=\{m\.days\} tier=\{m\.tier\} earned=\{m\.earned\} daysToGo=\{m\.daysToGo\} \/>/);
    assert.match(blocks, /<Tile value=\{stats\.totalXp\} label=\{TOTAL_XP_LABEL\} \/>/);
    assert.match(blocks, /<Tile value=\{stats\.longestStreak\} label=\{LONGEST_STREAK_LABEL\} \/>/);
    assert.match(blocks, /<Tile value=\{stats\.perfectDays\} label=\{PERFECT_DAYS_LABEL\} \/>/);
    assert.match(blocks, /numberOfLines=\{1\} adjustsFontSizeToFit/);
  });
});

describe('Progress: the two halves load on their own, as before', () => {
  test('the stats half: the shared store, reload on focus and on remote changes (coalesced), its own failure line', () => {
    const hook = code('hooks/use-progress-stats.ts');
    assert.match(hook, /loadShared\(userId, getLocalDateString\(\), \(\) => getGamificationStats\(userId\)\)/);
    assert.match(hook, /useFocusEffect\(useCallback\(\(\) => \{\s*refresh\('focus'\);\s*return onRemoteChange\(reloadForRemote\);/);
    assert.match(hook, /state\.again = true;/);
    assert.match(hook, /const stats = entry && entry\.userId === userId \? entry\.stats : null;/);
    assert.match(code('app/(tabs)/progress.tsx'), /\{!stats && failed && <Text style=\{styles\.empty\}>\{STATS_FAILED_LINE\}<\/Text>\}/);
  });

  test('the summary half: local rows on focus only (no remote listener, no sync), never another account\'s rows, its own failure line', () => {
    const section = code('components/progress/summary-section.tsx');
    assert.match(section, /useFocusEffect\(useCallback\(\(\) => \{\s*load\(\);\s*\}, \[load\]\)\)/);
    assert.doesNotMatch(section, /onRemoteChange|requestSync|syncEngine/);
    assert.match(section, /const visible = loaded && loaded\.userId === userId \? loaded : null;/);
    assert.match(section, /if \(seq !== loadSeq\.current\) return;/);
    assert.match(section, /\{!summary && failed && <Text style=\{styles\.empty\}>\{SUMMARY_FAILED_LINE\}<\/Text>\}/);
  });

  test('neither half imports the other: one failing never hides the other', () => {
    assert.doesNotMatch(code('components/progress/summary-section.tsx'), /use-progress-stats|stats-blocks/);
    assert.doesNotMatch(code('components/progress/stats-blocks.tsx') + code('hooks/use-progress-stats.ts'), /summary-section|getSummaryRows/);
  });

  test('the level and streak blocks show without any habit; the no-habits and nothing-scheduled cards still lead to the habit form', () => {
    const section = code('components/progress/summary-section.tsx');
    assert.match(section, /summary\.month\.empty === 'noHabits' \? \(\s*<SummaryEmptyCard kind="noHabits" onCreate=\{createHabit\} \/>/);
    assert.match(section, /<SummaryEmptyCard kind="nothingScheduled" onCreate=\{createHabit\} \/>/);
    assert.match(section, /router\.push\('\/habit-form'\)/);
    assert.doesNotMatch(code('app/(tabs)/progress.tsx'), /noHabits/);
  });
});

describe('Progress: one radar in the app', () => {
  test('RadarSummary is drawn in exactly one place; the toggle drives the shared window; the highlights are the card\'s two lines', () => {
    const uses = APP_FILES.filter((f) => /<RadarSummary\s/.test(code(f)));
    assert.deepEqual(uses, ['components/progress/summary-section.tsx']);
    assert.equal(APP_FILES.filter((f) => /RadarCard/.test(code(f))).length, 0);
    const section = code('components/progress/summary-section.tsx');
    assert.match(section, /<RangeToggle value=\{range\} onChange=\{setRadarWindow\} \/>/);
    assert.match(section, /const range: SummaryRange = useRadarWindow\(\);/);
    assert.match(section, /<RadarHighlights window=\{radar\[range\]\} \/>/);
    const hl = code('components/radar/radar-highlights.tsx');
    assert.match(hl, /if \(window\.starting\) return null;/);
    assert.match(hl, /strongestText\(strongest\.axis, strongest\.percent\)/);
    assert.match(hl, /needsCareText\(needsCare\.axis, needsCare\.percent\)/);
  });
});

describe('the words moved from the old Summary and Profile screens, unchanged', () => {
  test('titles, failure lines and section headers', () => {
    assert.deepEqual(
      [copy.PROGRESS_TITLE, copy.SUMMARY_FAILED_LINE, copy.STATS_FAILED_LINE, copy.LAST_7_DAYS_TITLE, copy.LAST_30_DAYS_TITLE,
        copy.BY_HABIT_TITLE, copy.MEDALS_TITLE, copy.LIFETIME_TITLE, copy.TOTAL_XP_LABEL, copy.LONGEST_STREAK_LABEL, copy.PERFECT_DAYS_LABEL],
      ['Progress.', "Your summary couldn't be loaded. It'll try again next time you open this tab.",
        "Your stats couldn't be loaded. They'll try again next time you open this tab.", 'Last 7 days', 'Last 30 days',
        'By habit', 'Medals', 'Lifetime', 'Total XP', 'Longest streak', 'Perfect days'],
    );
  });

  test('the level, streak and tile texts', () => {
    assert.equal(copy.levelText(7), 'Level 7');
    assert.equal(copy.streakText(1), '1 day streak');
    assert.equal(copy.streakText(12), '12 days streak');
    assert.equal(copy.longestText(0), 'Longest: 0 days');
    assert.equal(copy.streakA11yLabel(3, 1), 'Current streak 3 days. Longest 1 day');
    assert.equal(copy.tileA11yLabel('Total XP', 250), 'Total XP 250');
  });

  test('the copy module is pure (no imports)', () => {
    assert.doesNotMatch(read('utils/copy/progress.ts'), /^import /m);
  });
});
