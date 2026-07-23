import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 50, branches: 40, functions: 50, lines: 50 },
    },
  },
});
