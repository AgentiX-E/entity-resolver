import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      thresholds: { statements: 85, branches: 85, functions: 85, lines: 85 },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/components/*.ts',
        'src/index.ts',
        'dist/**',
      ],
    },
    environment: 'jsdom',
  },
});
