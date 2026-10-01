import { defineConfig } from 'vitest/config'

// The Worker tests start the Worker in local workerd (wrangler's test
// harness), so the first start can take a while.
export default defineConfig({
  test: {
    include: ['worker/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
