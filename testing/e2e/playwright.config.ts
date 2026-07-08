import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,
  workers: process.env.CI ? 4 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:3010',
    video: 'on',
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
