// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Firestore is loaded on first use through services/firestore.js, so it never costs startup time.
    // A static import anywhere else would put it back on the startup path.
    ignores: ['services/firestore.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'firebase/firestore', message: 'Use firestore() from @/services/firestore inside a function (lazy load).' },
          { name: '@firebase/firestore', message: 'Use firestore() from @/services/firestore inside a function (lazy load).' },
        ],
      }],
    },
  },
]);
