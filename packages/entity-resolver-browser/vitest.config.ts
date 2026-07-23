import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 76, branches: 64, functions: 100, lines: 76 },
    },
  },
});
