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
    // MCP client/server handshake tests spin up transports; the first test
    // absorbs cold module-import cost (~20s+ on CI), so give tests more than
    // vitest's 5s default headroom to avoid flaky timeouts under CI load.
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', '**/*.test.ts', 'src/types.ts'],
    },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.ts', './src/stdio.ts', './src/apps/index.ts'],
    srcDir: './src',
    cjs: false,
  }),
)
