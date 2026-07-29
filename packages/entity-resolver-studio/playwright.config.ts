import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'dot',
  timeout: 15000,
  use: {
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Skip tsconfig resolution for E2E test files
  build: {
    external: ['@agentix-e/*'],
  },
});
