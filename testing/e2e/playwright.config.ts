import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 4,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['list']],
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:3010',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // aimock started in globalSetup, shared across all workers on port 4010.
  // Tests send X-Test-Id headers for per-test sequenceIndex isolation.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
