import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@tanstack/ai-cli-tests',
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // Spawning a real subprocess per case is slower than a unit test; give the
    // suite room and run files serially to keep stdout assertions clean.
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
