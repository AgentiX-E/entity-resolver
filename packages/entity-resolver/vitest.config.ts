import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Umbrella package is a pure facade (re-exports only) —
      // coverage thresholds are not meaningful for re-export code.
      // Re-export correctness is verified by integration tests.
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
    server: {
      deps: {
        inline: [/@agentix-e\/entity-resolver/],
      },
    },
  },
});
