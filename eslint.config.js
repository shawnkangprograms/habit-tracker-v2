// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // functions/ is the Cloud Functions package (Node 22, its own dependencies), not app code
    ignores: ['dist/*', 'functions/**'],
  },
  {
    // Firestore is loaded on first use through services/firestore.js, so it never costs startup time.
    // A static import anywhere else would put it back on the startup path.
    // Cloud Functions (firebase/functions) likewise: services/insights.ts requires it inside a function, after
    // Home is usable. Type-only imports are erased, so they are allowed. Both live in this ONE block: a second
    // block setting no-restricted-imports would replace this rule, not add to it.
    ignores: ['services/firestore.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'firebase/firestore', message: 'Use firestore() from @/services/firestore inside a function (lazy load).' },
          { name: '@firebase/firestore', message: 'Use firestore() from @/services/firestore inside a function (lazy load).' },
          { name: 'firebase/functions', allowTypeImports: true, message: 'Load it inside a function, as services/insights.ts does (lazy load).' },
          { name: '@firebase/functions', allowTypeImports: true, message: 'Load it inside a function, as services/insights.ts does (lazy load).' },
        ],
      }],
    },
  },
]);
