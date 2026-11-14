// C1b Set 2: every colour comes from constants/theme.ts. This reads the app's source with the TypeScript compiler and
// fails on a colour written as a literal anywhere else: a #hex string, an rgb()/rgba()/hsl() string, or the names
// 'white' and 'black'. Only string literals and template text are read, so comments never count. A token with a
// two-hex-digit alpha suffix (colors.error + '14', `${color}30`) is allowed: the suffix is not a colour on its own.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|js)$/.test(rel) ? [rel] : [];
  });
}

const THEME = 'constants/theme.ts';
const SCANNED = ['app', 'components', 'hooks', 'services', 'utils', 'constants', 'sync', 'db'].flatMap(sourceFiles).filter((f) => f !== THEME);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\s*\(/i;
const NAMED = /^(?:white|black)$/i;

export type Hit = {line: number; text: string};

// The colour literals in one file's strings and template text
export function colourLiterals(fileName: string, source: string): Hit[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const hits: Hit[] = [];
  const check = (node: ts.Node, text: string) => {
    if (HEX.test(text) || FUNCTIONAL.test(text) || NAMED.test(text.trim())) {
      hits.push({line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text});
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

describe('the scan itself', () => {
  test('it finds hex, rgb()/rgba()/hsl() and white/black in strings, templates and JSX props', () => {
    const src = [
      "const a = '#fff';", 'const b = "#1a1815";', "const c = 'rgba(0, 0, 0, 0.5)';", 'const d = `#${x}` + `${y} #abcdef`;',
      "const e = 'white';", '<View style={{color: "black"}} />;', "const f = 'hsl(10, 50%, 50%)';", "const g = '#11223344';",
    ].join('\n');
    assert.deepEqual(colourLiterals('x.tsx', src).map((h) => h.line), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('it skips comments, token suffixes, test ids and ordinary words', () => {
    const src = [
      '// the old #1e1b17 surface, rgba(10, 9, 8, 0.82) behind it', '/* white on #f2691b */',
      "const a = colors.error + '14';", 'const b = `${color}30`;', "const c = 'whiteboard';", "const d = 'Step #1';",
      "const e = 'tab-today';", "const f = 'onAccent';",
    ].join('\n');
    assert.deepEqual(colourLiterals('x.tsx', src), []);
  });
});

describe('every colour comes from constants/theme.ts', () => {
  test('no colour literal in app, components, hooks, services, utils, constants (but theme.ts), sync or db', () => {
    const found = SCANNED.flatMap((file) => colourLiterals(file, read(file)).map((h) => `${file}:${h.line} ${JSON.stringify(h.text)}`));
    assert.deepEqual(found, []);
    assert.ok(SCANNED.length > 150, String(SCANNED.length));
  });

  test('theme.ts is where they live (the scan would find them there)', () => {
    assert.ok(colourLiterals(THEME, read(THEME)).length > 20);
  });
});
