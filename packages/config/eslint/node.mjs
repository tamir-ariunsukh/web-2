import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/**
 * ESLint config for Node.js services (Express, workers, shared packages).
 */
export const nodeConfig = tseslint.config(
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-process-exit': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="process"][callee.property.name="exit"]',
          message:
            'Do not call process.exit() in application code. Throw and let the error handler decide.',
        },
      ],
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
);

export { nodeConfig as baseConfig };
export default nodeConfig;
