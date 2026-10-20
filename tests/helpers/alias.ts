/// <reference types="node" />
// Test-only: resolves the app's "@/..." imports (tsconfig paths) for Node's test runner,
// so app modules that import other app modules can be tested unchanged.
// Import this file first, then load app modules with a dynamic import(): static imports are resolved
// before this file runs.
import {registerHooks} from 'node:module';
import {statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = join(ROOT, specifier.slice(2));
      const candidates = [base + '.ts', base + '.tsx', base + '.js', join(base, 'index.ts'), base];
      const found = candidates.find(isFile);
      if (found) return {url: pathToFileURL(found).href, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});
