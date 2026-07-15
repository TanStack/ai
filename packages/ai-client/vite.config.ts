import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Re-route the no-op devtools factories to the real implementations
    // for the whole test suite. The shipping default is no-op (so the
    // heavy bridge classes stay out of `@tanstack/ai-client`'s main
    // bundle); tests assert on devtools event emission and need the
    // real bridges.
    setupFiles: ['./tests/use-real-devtools-bridges.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts',
      ],
      include: ['src/**/*.ts'],
    },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    // `devtools.ts` is a separately-published subpath
    // (`@tanstack/ai-client/devtools`) holding the heavy bridge
    // implementations; declare it as its own entry so the build emits
    // it independently and the main entry can stay free of the bridge
    // classes (they're imported only via `import type` from clients).
    entry: ['./src/index.ts', './src/devtools.ts', './src/plugin.ts'],
    srcDir: './src',
    cjs: false,
  }),
)
