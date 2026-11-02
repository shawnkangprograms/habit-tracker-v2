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
  {
    // Onboarding answers never leave the phone (docs/ONBOARDING_SPEC.md, section 2): no Firebase at all, not even
    // type imports, and no sync or insight modules. This block replaces the rule above for these files, so it
    // repeats the Firestore and Functions bans in their stricter form. tests/onboarding-isolation.test.ts also
    // scans these files for require() calls, which this rule can't see.
    files: [
      'app/onboarding*', 'app/onboarding/**', 'components/onboarding/**', 'utils/onboarding/**',
      'services/onboardingStore*.ts', 'hooks/use-onboarding-gate.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'firebase/firestore', message: 'Onboarding answers never leave the phone.' },
          { name: '@firebase/firestore', message: 'Onboarding answers never leave the phone.' },
          { name: 'firebase/functions', message: 'Onboarding answers never leave the phone.' },
          { name: '@firebase/functions', message: 'Onboarding answers never leave the phone.' },
          { name: '@/services/firestore', message: 'Onboarding answers never leave the phone.' },
          { name: '@/services/insights', message: 'Onboarding answers are never sent to the insight function.' },
          { name: '@/services/insightCache', message: 'Onboarding answers are never sent to the insight function.' },
          { name: '@/utils/insightInput', message: 'Onboarding answers are never sent to the insight function.' },
        ],
        patterns: [
          { group: ['firebase', 'firebase/*', '@firebase/*'], message: 'Onboarding answers never leave the phone.' },
          { group: ['@/sync/*', '@/db/sync', '@/db/syncCore'], message: 'Onboarding answers are never synced.' },
        ],
      }],
    },
  },
]);
