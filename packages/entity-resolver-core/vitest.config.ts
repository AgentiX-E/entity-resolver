import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 94,
        branches: 85,
        functions: 94,
        lines: 94,
      },
    },
  },
});
