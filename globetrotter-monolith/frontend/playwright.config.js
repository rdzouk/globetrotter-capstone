import { defineConfig, devices } from '@playwright/test';

const production = process.env.GT_TEST_PRODUCTION === '1';
const baseURL = `http://127.0.0.1:${production ? 5175 : 5174}`;

export default defineConfig({
  testDir: './react/tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: production ? 'npm run preview -- --port 5175 --strictPort' : 'npm run dev -- --port 5174 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});