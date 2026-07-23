import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 70, branches: 55, functions: 70, lines: 70 },
    },
  },
});
