import { defineConfig } from 'vitest/config'

// A minimal Node-environment vitest config for the example's unit tests (e.g.
// the SQLite persistence conformance suite). It deliberately does NOT load the
// TanStack Start / Nitro plugins from `vite.config.ts` — these tests exercise
// plain server-side modules and need Node's `node:sqlite`, not the app bundle.
export default defineConfig({
  test: {
    name: 'ts-react-chat',
    environment: 'node',
    // Scoped to the persistence demo. Other `*.test.ts` files under `src/`
    // predate this and were never wired to a `test:lib` target; leave their
    // (dormant) status unchanged rather than silently activating them here.
    include: ['src/lib/**/*.test.ts'],
    watch: false,
  },
})
