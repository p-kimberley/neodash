import { defineConfig } from '@playwright/test';

// The app under test: the webpack dev server (5173) or the backend container (3000).
export const BASE = process.env.APP_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: './global-setup.mjs',
  // Tests share one backend and one set of seed dashboards; temporary dashboards use unique ids.
  fullyParallel: false,
  workers: 2,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One retry: under the load of two browsers, the dev server's proxy occasionally stalls a request.
  // A test that passes on retry is reported as flaky, so it stays visible.
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: {
    baseURL: BASE,
    viewport: { width: 1440, height: 950 },
    storageState: './.auth/editor.json',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
});
