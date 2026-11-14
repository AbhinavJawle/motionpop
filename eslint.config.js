// Root ESLint config for packages/*. apps/web has its own config extending eslint-config-next.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.check/**',
      'apps/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Motion contract (component-contract.md, R1.2): seek(t) is a pure function of t.
    files: [
      'packages/motion/src/core/**/*.ts',
      'packages/motion/src/components/**/*.ts',
      'packages/motion/src/runtime/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['setTimeout', 'setInterval', 'requestAnimationFrame'].map((name) => ({
          name,
          message: `${name} breaks the motion contract: seek(t) must be a pure function of t (component-contract.md).`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...[
          ['Date', 'now'],
          ['Math', 'random'],
          ['performance', 'now'],
          ['globalThis', 'setTimeout'],
          ['globalThis', 'setInterval'],
          ['globalThis', 'requestAnimationFrame'],
          ['window', 'setTimeout'],
          ['window', 'setInterval'],
          ['window', 'requestAnimationFrame'],
        ].map(([object, property]) => ({
          object,
          property,
          message: `${object}.${property} breaks the motion contract: seek(t) must be a pure function of t; use rngFor(seed) for randomness (component-contract.md).`,
        })),
      ],
    },
  },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
