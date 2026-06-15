/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import angular from '@analogjs/vite-plugin-angular'

export default defineConfig({
  plugins: [angular()],
  test: {
    name: '@tanstack/ai-angular',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest.setup.ts'],
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
})
