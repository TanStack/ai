import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import solid from 'vite-plugin-solid'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [solid()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    server: {
      deps: {
        // Keep the testing library on the SAME solid-js instance the hooks
        // under test use. Externalized, it would be resolved by Node (server
        // build, and unmocked by `tests/setup.ts`), so its `createRoot` owner
        // would be invisible to the hooks' reactive graph.
        inline: ['@solidjs/testing-library'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
        '**/types.ts',
      ],
      include: ['src/**/*.ts'],
    },
  },
  resolve: {
    // Without this, solid-js resolves through its `node` export condition and
    // vitest loads the SERVER build, where `onMount` / `createEffect` are
    // no-ops — mount-time behaviour (devtools registration, persistence
    // hydration) would never run under test. Force the client build.
    conditions: ['browser', 'development', 'import', 'default'],
    alias: {
      '@tanstack/ai-event-client': resolve(
        __dirname,
        '../ai-event-client/src/index.ts',
      ),
    },
  },
})
