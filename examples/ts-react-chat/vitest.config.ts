import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// A minimal Node-environment vitest config for the example's unit tests (the
// SQLite persistence conformance suite, the interrupt route's pure helpers). It
// deliberately does NOT load the TanStack Start / Nitro plugins from
// `vite.config.ts` — these tests exercise plain server-side modules and need
// Node's `node:sqlite`, not the app bundle.
export default defineConfig({
  resolve: {
    // The app's `@/*` -> `src/*` tsconfig path, which the Start plugin supplies
    // in the real build. Route modules under test import through it.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'ts-react-chat',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    watch: false,
  },
})
