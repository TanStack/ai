import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3002',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Isolate persisted state to a throwaway file, wiped on start, so runs never
    // inherit a previous run's runs/memory/automations (see src/server/store.ts).
    command:
      'rm -f .data/e2e-state.json && DASHBOARD_STATE_FILE=.data/e2e-state.json pnpm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
