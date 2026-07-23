import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 94, branches: 95, functions: 94, lines: 94 },
    },
  },
});
