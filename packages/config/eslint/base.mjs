import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import turbo from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/**
 * Shared base ESLint flat config.
 * Language-agnostic rules; each app extends this and adds its own plugin set.
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
      '**/prisma/generated/**',
      // ESLint config files are plain ESM and outside the TS project graph.
      '**/eslint.config.mjs',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/next.config.ts',
      '**/postcss.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    plugins: {
      'import-x': importX,
      turbo,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // ── TypeScript ──────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // ── Imports ─────────────────────────────────────────────
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],

      // ── Turborepo ───────────────────────────────────────────
      'turbo/no-undeclared-env-vars': 'warn',

      // ── General ─────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['**/*.config.{js,mjs,cjs,ts}', '**/*.setup.ts', '**/scripts/**/*'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  {
    // Process entry points legitimately terminate the process after draining.
    files: ['**/src/index.ts', '**/src/main.ts'],
    rules: {
      'no-process-exit': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  {
    // Command-line scripts report progress on stdout by design.
    files: ['**/prisma/seed.ts', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  prettier,
);

export default baseConfig;
