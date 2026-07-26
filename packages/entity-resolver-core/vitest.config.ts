import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Branches at 89 (documented 89.77, target 95 in I21).
      thresholds: { statements: 97, branches: 89, functions: 98, lines: 97 },
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
