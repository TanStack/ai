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
    // Core entry + the optional ngrok tool-bridge provisioner subpath
    // (`@tanstack/ai-sandbox/ngrok`), which lazy-loads the optional `@ngrok/ngrok`
    // peer dep so the core never pulls in its native binary + the SandboxStore
    // conformance testkit (`@tanstack/ai-sandbox/testkit`).
    entry: ['./src/index.ts', './src/ngrok.ts', './src/testkit/conformance.ts'],
    srcDir: './src',
    // The conformance testkit imports Vitest; keep it external so the built
    // artifact references the consumer's Vitest at test time.
    externalDeps: ['vitest'],
    cjs: false,
  }),
)
