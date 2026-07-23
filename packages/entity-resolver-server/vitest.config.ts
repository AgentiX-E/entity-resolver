import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 90, branches: 75, functions: 85, lines: 90 },
    },
    server: {
      deps: {
        inline: [/@agentix-e\/entity-resolver-core/],
      },
    },
  },
});
