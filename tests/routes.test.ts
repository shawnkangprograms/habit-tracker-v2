// Stage C2, Set 3 (tab bar and routes): every route string written in the source is a route that exists. The app's
// routes are read from the file tree under app/ (a "(group)" folder adds no path part, "index" is the folder's own
// path, a "[param]" file matches one segment), and every place the source pushes, replaces, navigates or links to a route
// is checked against them. The generated typed routes (.expo/types/router.d.ts) are git-ignored and only refresh when the
// dev server starts, so this scan is the guard that doesn't depend on them. It also names the two routes that went away
// (/settings became /you, /summary merged into /progress): any push or link left to them fails here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return filesUnder(rel);
    return /\.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}

// '/' for app/(tabs)/index.tsx, '/progress' for app/(tabs)/progress.tsx, '/packs/choose' for app/packs/choose.tsx
export function routesOnDisk(): string[] {
  const routes = new Set<string>();
  for (const file of filesUnder('app')) {
    const parts = file.slice('app/'.length).replace(/\.(tsx?|js)$/, '').split('/').filter((p) => !/^\(.*\)$/.test(p));
    if (parts[parts.length - 1] === '_layout') continue;
    if (parts[parts.length - 1] === 'index') parts.pop();
    routes.add('/' + parts.join('/'));
  }
  return [...routes].sort();
}

const matches = (route: string, known: string[]) => known.some((k) => {
  const a = k.split('/');
  const b = route.split('/');
  return a.length === b.length && a.every((seg, i) => /^\[.+\]$/.test(seg) || seg === b[i]);
});

// Route strings written in the source: router.push/replace/navigate/dismissTo('/x'), pathname: '/x', href="/x", and
// the `as Href` casts. A template literal or a variable is not a literal route and is not read.
const CALL = /\b(?:router\.(?:push|replace|navigate|dismissTo|prefetch)|navigate|push|replace)\(\s*(?:\{\s*pathname:\s*)?(['"])(\/[^'"?#]*)(?:[?#][^'"]*)?\1/g;
const PATHNAME = /\bpathname:\s*(['"])(\/[^'"?#]*)(?:[?#][^'"]*)?\1/g;
const HREF = /\bhref=(?:\{\s*)?(['"])(\/[^'"?#]*)(?:[?#][^'"]*)?\1/g;
const TERNARY = /\?\s*(['"])(\/[^'"?#]*)\1\s*:\s*(['"])(\/[^'"?#]*)\3/g;// router.replace(cond ? '/a' : '/b')

export function routeStrings(source: string): string[] {
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const re of [CALL, PATHNAME, HREF]) for (const m of code.matchAll(re)) found.push(m[2]);
  for (const m of code.matchAll(TERNARY)) found.push(m[2], m[4]);
  return found;
}

const SOURCE_DIRS = ['app', 'components', 'hooks', 'services', 'utils'];
const SOURCES = SOURCE_DIRS.flatMap(filesUnder);

describe('the route scan itself', () => {
  test('it reads the file tree: groups add nothing, index is the folder path, [param] matches a segment', () => {
    const routes = routesOnDisk();
    for (const route of ['/', '/progress', '/you', '/habit-form', '/packs/choose', '/admin/overview', '/onboarding', '/profile-name']) {
      assert.ok(routes.includes(route), route);
    }
    assert.ok(matches('/anything', ['/[id]']));
    assert.ok(!matches('/a/b', ['/[id]']));
  });

  test('it finds pushes, replaces, navigates, pathname objects, hrefs and a conditional', () => {
    assert.deepEqual(routeStrings("router.push('/a'); router.replace(\"/b\"); router.navigate('/c?x=1');"), ['/a', '/b', '/c']);
    assert.deepEqual(routeStrings("router.push({pathname: '/d', params: {from: 'home'}});"), ['/d', '/d']);
    assert.deepEqual(routeStrings('<Link href="/e" />'), ['/e']);
    assert.deepEqual(routeStrings("router.replace(from === 'x' ? '/f' : '/g');"), ['/f', '/g']);
    assert.deepEqual(routeStrings("router.push('/h' as Href);"), ['/h']);
    assert.deepEqual(routeStrings("// router.push('/ignored')\nconst x = 1;"), []);
  });
});

describe('every route string in the source is a route', () => {
  test('there are route strings to check, and each one matches a file under app/', () => {
    const known = routesOnDisk();
    let checked = 0;
    for (const file of SOURCES) {
      for (const route of routeStrings(read(file))) {
        checked++;
        assert.ok(matches(route, known), `${file}: ${route}`);
      }
    }
    assert.ok(checked >= 25, String(checked));
  });

  test('the four places that went to /settings now go to /you, and nothing pushes or links to /settings or /summary', () => {
    const pinned: [string, RegExp][] = [
      ['app/admin/overview.tsx', /router\.replace\('\/you'\)/],
      ['app/habit-form.tsx', /router\.navigate\('\/you'\)/],
      ['app/packs/choose.tsx', /router\.replace\(from === 'settings' \? '\/you' : '\/'\)/],
      ['app/profile-name.tsx', /router\.replace\('\/you'\)/],
    ];
    for (const [file, pattern] of pinned) assert.match(read(file), pattern, file);
    for (const file of SOURCES) {
      const gone = routeStrings(read(file)).filter((r) => r === '/settings' || r === '/summary' || r.startsWith('/settings/') || r.startsWith('/summary/'));
      assert.deepEqual(gone, [], file);
    }
  });

  test('the old route files are gone and the new ones exist; the template modal and ThemedView are removed', () => {
    for (const file of ['app/(tabs)/settings.tsx', 'app/(tabs)/summary.tsx', 'app/(tabs)/profile.tsx', 'app/modal.tsx', 'components/themed-view.tsx']) {
      assert.equal(existsSync(join(ROOT, file)), false, file);
    }
    for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/progress.tsx', 'app/(tabs)/you.tsx', 'components/themed-text.tsx', 'hooks/use-theme-color.ts']) {
      assert.ok(existsSync(join(ROOT, file)), file);
    }
    assert.doesNotMatch(read('app/_layout.tsx'), /name="modal"/);
    for (const file of SOURCES) assert.doesNotMatch(read(file), /themed-view|ThemedView/, file);
  });

  test('the legacy chain is kept: the root layout draws ThemedText, which reads useThemeColor, which reads Colors', () => {
    assert.match(read('constants/theme.ts'), /export const Colors = \{/);
    assert.match(read('app/_layout.tsx'), /import \{ThemedText\} from '@\/components\/themed-text';/);
    assert.match(read('components/themed-text.tsx'), /useThemeColor/);
    assert.match(read('hooks/use-theme-color.ts'), /Colors/);
  });

  test('the You tab: route, title, id and icon; the screen is YouScreen with the "You." heading', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    assert.match(layout, /name="you"\s+options=\{\{\s+title: 'You',\s+tabBarButtonTestID: TEST_IDS\.tabs\.you,[\s\S]*?name="person\.fill"/);
    assert.match(layout, /name="index"\s+options=\{\{\s+title: 'Today',\s+tabBarButtonTestID: TEST_IDS\.tabs\.today,/);
    assert.match(layout, /name="progress"\s+options=\{\{\s+title: 'Progress',/);
    assert.match(read('app/(tabs)/you.tsx'), /export default function YouScreen/);
    assert.match(read('app/(tabs)/you.tsx'), /\{YOU_TITLE\}/);
    assert.match(read('utils/copy/settings.ts'), /export const YOU_TITLE = 'You\.';/);
    assert.match(read('components/ui/icon-symbol.tsx'), /'person\.fill': 'person'/);
  });
});
