import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/deployment',
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/deployment-playwright-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
  },
});
