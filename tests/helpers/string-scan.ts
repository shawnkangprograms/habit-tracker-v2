/// <reference types="node" />
// Finds the user-facing text written inline in the app's source: Alert.alert titles, messages and button labels, text
// inside JSX elements, and the text props of controls (placeholder, accessibilityLabel, accessibilityHint, label,
// title). Used by scripts/string-inventory.ts (the inventory) and tests/copy-identical.test.ts (the check that text
// moved into utils/copy/<area>.ts is word for word the same). Test-only: it reads the source with the TypeScript
// compiler API, never runs it.
//
// A string with a value inside it (a template literal) is written with every value as "${…}", so a template that
// moves into a copy function keeps the same text as long as its words and slots are the same.
import ts from 'typescript';

// literal: a sentence-like string written anywhere else (a message returned by a function, kept in a const, thrown)
export type Kind = 'alert' | 'text' | 'attr' | 'literal';
// partial: the text is one piece of a longer text (words next to a {value} in JSX, or one side of a +): when the whole
// moves into a copy module, the piece is part of a longer literal there, so it only has to be contained in one
export type Found = {line: number; kind: Kind; attr?: string; text: string; partial?: boolean};

// The props whose string value is read or shown to the user
export const TEXT_ATTRS = new Set(['placeholder', 'accessibilityLabel', 'accessibilityHint', 'label', 'title']);

const SLOT = '${…}';

// A string that reads like a sentence or a label: words with a space, starting with a capital or ending in punctuation
// (not SVG path data, SQL or a URL, which have spaces and capitals too)
const SVG_PATH = /^[MmLlHhVvCcQqZz][\dMmLlHhVvCcQqZz\s.,-]*(\$\{…\}[\dMmLlHhVvCcQqZz\s.,-]*)*$/;
const SQL = /^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|ALTER|DROP)\b/;
const messageLike = (text: string) => /\s/.test(text) && hasLetter(text) && (/^[A-Z]/.test(text) || /[.!?…:]$/.test(text))
  && !/:\/\//.test(text) && !SVG_PATH.test(text) && !SQL.test(text);

// Collapses runs of white space (a JSX text can wrap over lines) and trims
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

// JSX text is written with HTML entities (&apos;); a copy module holds the character itself
const ENTITIES: Record<string, string> = {
  '&apos;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'", '&hellip;': '…', '&middot;': '·',
};
const decode = (text: string) => text.replace(/&(?:apos|quot|amp|lt|gt|nbsp|hellip|middot|#39);/g, (m) => ENTITIES[m]);
const hasLetter = (text: string) => /\p{L}/u.test(text);

// The text of a template literal with each ${…} slot written as SLOT
export function templateText(node: ts.TemplateLiteral): string {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return node.head.text + node.templateSpans.map((span) => SLOT + span.literal.text).join('');
}

// The strings an expression can show: a literal, a template, the branches of ?:, and either side of && || ??
// (never into a call or a variable: that text is not written here)
type Piece = {text: string; partial: boolean};
function textsOf(node: ts.Node): Piece[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{text: node.text, partial: false}];
  if (ts.isTemplateExpression(node)) return [{text: templateText(node), partial: false}];
  if (ts.isParenthesizedExpression(node)) return textsOf(node.expression);
  if (ts.isConditionalExpression(node)) return [...textsOf(node.whenTrue), ...textsOf(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return textsOf(node.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...textsOf(node.left), ...textsOf(node.right)];
    }
    if (op === ts.SyntaxKind.PlusToken) {// the pieces of one text
      return [...textsOf(node.left), ...textsOf(node.right)].map((p) => ({...p, partial: true}));
    }
  }
  return [];
}

export function scanSource(fileName: string, source: string): Found[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Found[] = [];
  const lineOf = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const add = (node: ts.Node, kind: Kind, text: string, attr?: string, partial = false) => {
    const t = tidy(text);
    if (t !== '' && hasLetter(t)) found.push({line: lineOf(node), kind, text: t, ...(attr ? {attr} : {}), ...(partial ? {partial} : {})});
  };
  // JSX text with a {value} or an element beside it is a piece of a longer text
  const hasSiblings = (text: ts.JsxText) => {
    const parent = text.parent;
    const children = ts.isJsxElement(parent) || ts.isJsxFragment(parent) ? parent.children : [];
    return children.some((c) => c !== text && !(ts.isJsxText(c) && c.text.trim() === ''));
  };

  // A string in code that is not text shown to the user: an import, a log, a comparison, a key, a type
  const notShown = (node: ts.Node) => {
    const parent = node.parent;
    if (!parent) return true;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent)) return true;
    if (ts.isElementAccessExpression(parent) || ts.isComputedPropertyName(parent) || ts.isExternalModuleReference(parent)) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
    if (ts.isBinaryExpression(parent) && [
      ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
    ].includes(parent.operatorToken.kind)) return true;
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression.getText(file);
      if (callee.startsWith('console.') || callee === 'require' || callee === 'mark') return true;
    }
    return false;
  };

  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && !notShown(node)) {
      const text = tidy(ts.isTemplateExpression(node) ? templateText(node) : node.text);
      if (messageLike(text)) add(node, 'literal', text);
    }
    if (ts.isJsxText(node)) {
      add(node, 'text', decode(node.text), undefined, hasSiblings(node));
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const p of textsOf(node.expression)) add(node, 'text', p.text, undefined, p.partial);
    } else if (ts.isJsxAttribute(node) && node.initializer && TEXT_ATTRS.has(node.name.getText(file))) {
      const init = node.initializer;
      const texts: Piece[] = ts.isStringLiteral(init) ? [{text: init.text, partial: false}] : ts.isJsxExpression(init) && init.expression ? textsOf(init.expression) : [];
      for (const p of texts) add(node, 'attr', p.text, node.name.getText(file), p.partial);
    } else if (ts.isCallExpression(node) && node.expression.getText(file) === 'Alert.alert') {
      const [title, message, buttons] = node.arguments;
      for (const arg of [title, message]) if (arg) for (const p of textsOf(arg)) add(arg, 'alert', p.text, undefined, p.partial);
      if (buttons && ts.isArrayLiteralExpression(buttons)) {
        for (const button of buttons.elements) {
          if (!ts.isObjectLiteralExpression(button)) continue;
          for (const prop of button.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText(file) === 'text') {
              for (const p of textsOf(prop.initializer)) add(prop.initializer, 'alert', p.text, undefined, p.partial);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // a string found as an alert, text or prop is not listed a second time as a plain literal
  const kept = found.filter((f, i) => f.kind !== 'literal' || !found.some((g, j) => j !== i && g.kind !== 'literal' && g.line === f.line && g.text === f.text));
  return kept.sort((a, b) => a.line - b.line);
}

// Every string a copy module holds: any string or template literal in it, word for word
export function literalsIn(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(tidy(node.text));
    else if (ts.isTemplateExpression(node)) out.push(tidy(templateText(node)));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

// The baseline texts that are no longer anywhere: not inline in the scanned files, and in no copy literal. A whole text
// has to equal a copy literal; a piece of one (partial) only has to be contained in a copy literal or in an inline text.
export function missingText(
  baseline: readonly {text: string; partial?: boolean}[],
  inlineNow: ReadonlySet<string>,
  copyNow: readonly string[],
): string[] {
  const copy = new Set(copyNow);
  const missing = new Set<string>();
  for (const {text, partial} of baseline) {
    if (inlineNow.has(text) || copy.has(text)) continue;
    if (partial && (copyNow.some((c) => c.includes(text)) || [...inlineNow].some((i) => i.includes(text)))) continue;
    missing.add(text);
  }
  return [...missing];
}
