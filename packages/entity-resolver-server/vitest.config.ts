import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: { statements: 93, branches: 81, functions: 90, lines: 93 },
    },
    server: {
      deps: {
        inline: [/@agentix-e\/entity-resolver-core/],
      },
    },
  },
});
