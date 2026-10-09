import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        // Domain logic must stay well covered; it gates the booking flow.
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
