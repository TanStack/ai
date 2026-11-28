import { defineConfig, devices } from '@playwright/test'

/**
 * E2E for the generative-ui example. The tests are LLM-free: they drive the
 * seeded Tier F fixtures and the live data-source transport, so they run
 * deterministically without any provider key. The Vite dev server (port 3000)
 * serves the app, the sandbox shells, and the `/api/live` stream.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run dev:vite',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
