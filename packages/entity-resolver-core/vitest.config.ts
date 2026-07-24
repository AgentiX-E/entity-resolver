import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Target: all dimensions ≥ 95%. Branches at 90 (current 88.88, gap in learner/analyzer/datasets).
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
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
