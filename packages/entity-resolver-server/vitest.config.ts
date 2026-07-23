import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
    server: {
      deps: {
        // Inline workspace packages so vitest can resolve their deps
        inline: [/@agentix-e\/entity-resolver-core/],
      },
    },
  },
});
