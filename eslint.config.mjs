import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'corpus/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'site/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...globals.commonjs } }
  },
  {
    files: ['src/bookmarklet.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node, PromptTrapScan: 'readonly', PromptTrapEval: 'readonly' } }
  }
];
