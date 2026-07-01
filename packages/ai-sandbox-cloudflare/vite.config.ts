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

// `cloudflare:workers` is a virtual module the Workers runtime provides at run
// time (used by the `/agent` Durable Object building blocks). Externalize it via
// a resolveId hook so we don't clobber the tanstack config's dep externalization.
const externalCloudflareWorkers = {
  name: 'external-cloudflare-virtual-modules',
  resolveId(id: string) {
    return id.startsWith('cloudflare:') ? { id, external: true } : null
  },
}

export default mergeConfig(
  mergeConfig(config, { plugins: [externalCloudflareWorkers] }),
  tanstackViteConfig({
    // The node-importable provider entry, the Workers-only `/agent` entry, and
    // the node-importable in-container `/runner` entry.
    entry: ['./src/index.ts', './src/agent.ts', './src/runner.ts'],
    srcDir: './src',
    cjs: false,
  }),
)
