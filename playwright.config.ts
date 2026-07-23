import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: [
    // 1) Download DuckDB WASM binary from CDN to local cache
    {
      command: 'pnpm tsx e2e/wasm-download.ts',
      url: 'http://localhost:3002/health',
      timeout: 120000,
      reuseExistingServer: false,
    },
    // 2) Serve WASM binaries and DuckDB dist files for browser tests
    {
      command: 'pnpm tsx e2e/wasm-server.ts',
      url: 'http://localhost:3001/health',
      timeout: 10000,
      reuseExistingServer: false,
    },
    // 3) Hono REST API server for endpoint tests
    {
      command: 'pnpm tsx e2e/test-server.ts',
      url: 'http://localhost:3000/health',
      timeout: 15000,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
