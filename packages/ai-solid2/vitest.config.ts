import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import solid from '@solidjs/vite-plugin'

const dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [solid({ diagnostics: true })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/**/*.ssr.test.tsx'],
    server: { deps: { inline: ['@solidjs/testing-library'] } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types.ts'],
    },
  },
  resolve: {
    conditions: ['browser', 'development', 'import', 'default'],
    alias: {
      '@tanstack/ai-event-client': resolve(
        dirname,
        '../ai-event-client/src/index.ts',
      ),
    },
  },
})
