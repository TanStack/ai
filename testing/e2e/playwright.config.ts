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
    video: process.env.CI ? 'retain-on-failure' : 'off',
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
    // Bedrock reranking signs requests to aimock, never to AWS.
    env: {
      AWS_ACCESS_KEY_ID: 'AKIA_BEDROCK_E2E',
      AWS_SECRET_ACCESS_KEY: 'bedrock-e2e-secret',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      AWS_DEFAULT_PROFILE: '',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
