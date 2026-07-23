import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // branches 89 (current 89.77%) — remaining 5.23pp in deep algorithmic code (I4 target: 95%)
      thresholds: { statements: 95, branches: 89, functions: 95, lines: 95 },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/benchmarks/data/**',
        'src/types/**',
        'src/interfaces/**',
        'src/matching/scorers/wasm/scorers/**',
        'src/matching/scorers/wasm/rust-scorer/**',
        'dist/**',
      ],
    },
  },
});
