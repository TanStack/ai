import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROVIDERS_DIR = join(HERE, 'src', 'providers')

// Discover every per-(provider, activity) barrel under
// src/providers/{provider}/{activity}/ at build time. Each `index.ts`
// (Zod barrel) and `schemas-index.ts` (JSON Schema barrel) becomes its own
// Vite entry so it's emitted as a separately-addressable chunk; that's what
// makes the `./*/json-schema` and `./*/zod` exports in package.json resolve
// to a real file in dist.
function discoverProviderEntries() {
  if (!existsSync(PROVIDERS_DIR)) return []
  const entries = []
  for (const providerEnt of readdirSync(PROVIDERS_DIR, {
    withFileTypes: true,
  })) {
    if (!providerEnt.isDirectory()) continue
    const providerDir = providerEnt.name
    for (const activityEnt of readdirSync(join(PROVIDERS_DIR, providerDir), {
      withFileTypes: true,
    })) {
      if (!activityEnt.isDirectory()) continue
      const activityDir = activityEnt.name
      const dir = join(PROVIDERS_DIR, providerDir, activityDir)
      const root = `./src/providers/${providerDir}/${activityDir}`
      if (existsSync(join(dir, 'index.ts'))) {
        entries.push(`${root}/index.ts`)
      }
      if (existsSync(join(dir, 'schemas-index.ts'))) {
        entries.push(`${root}/schemas-index.ts`)
      }
    }
  }
  return entries
}

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
        'scripts/',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/*.gen.ts',
      ],
      include: ['src/**/*.ts'],
    },
  },
})

// The schemas package ships per-provider subpath barrels. Each entry below
// becomes its own dist chunk. We deliberately do NOT add a top-level
// aggregator entry — the default `index.ts` only re-exports `openai-strict`,
// forcing consumers to the per-provider subpaths so bundlers tree-shake by
// file.
export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: [
      './src/index.ts',
      './src/openai-strict.ts',
      ...discoverProviderEntries(),
    ],
    srcDir: './src',
    cjs: false,
  }),
)
