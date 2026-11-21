import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/protocol',
  timeout: 180000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/protocol-playwright-results.json' }]],
  use: {
    actionTimeout: 15000,
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
