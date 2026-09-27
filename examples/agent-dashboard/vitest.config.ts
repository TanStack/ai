import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// A minimal Node-environment vitest config for the example's unit tests (the
// Reddit listing parser). It deliberately does NOT load the TanStack Start /
// Nitro plugins from `vite.config.ts` — these tests exercise plain server-side
// modules, not the app bundle.
export default defineConfig({
  resolve: {
    // The app's `@/*` -> `src/*` tsconfig path, which the Start plugin supplies
    // in the real build.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'agent-dashboard',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    watch: false,
  },
})
