import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
