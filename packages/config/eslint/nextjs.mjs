import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/**
 * ESLint config for Next.js apps.
 */
export const nextjsConfig = tseslint.config(
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['app/**/page.tsx', 'app/**/layout.tsx', 'app/**/error.tsx', 'app/**/loading.tsx'],
    rules: {
      // Next.js App Router exports require default exports.
      'import-x/no-default-export': 'off',
    },
  },
);

export { nextjsConfig as baseConfig };
export default nextjsConfig;
