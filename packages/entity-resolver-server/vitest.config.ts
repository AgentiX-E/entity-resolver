import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { coverage: { provider: 'v8', thresholds: { statements: 40, branches: 50, functions: 50, lines: 40 } } },
});
