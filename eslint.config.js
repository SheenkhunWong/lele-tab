import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'dist-firefox', 'node_modules', '**/*.{ts,tsx}'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.es2022
      },
      parserOptions: {
        sourceType: 'module'
      }
    }
  }
];
