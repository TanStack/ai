import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

export default defineConfig({
  testDir: './tests',
  // Run tests in parallel by default
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Use single worker in CI for stability with real API calls
  workers: process.env.CI ? 1 : undefined,
  // Reporter configuration
  reporter: [['html', { open: 'never' }], ['list']],
  // Extended timeout for real API calls (60 seconds per test)
  timeout: 60_000,
  // Expect timeout for assertions
  expect: {
    timeout: 30_000,
  },
  use: {
    // Base URL for the testing panel
    baseURL: 'http://localhost:3010',
    // Collect trace on first retry
    trace: 'on-first-retry',
    // Screenshot on failure
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the dev server before running tests
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
