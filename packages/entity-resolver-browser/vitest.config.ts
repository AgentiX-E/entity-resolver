import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 73, branches: 62, functions: 100, lines: 73 },
    },
  },
});
