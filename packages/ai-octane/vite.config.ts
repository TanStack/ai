import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { octane } from 'octane/compiler/vite'
import packageJson from './package.json'

const SELF = resolve(import.meta.dirname, 'src/index.ts')

// `@octanejs/testing-library` publishes uncompiled TypeScript (`main:
// src/index.ts`), so Vitest has to transform it instead of externalizing it
// the way it would a built dependency.
const inlineDeps = ['@octanejs/testing-library']

// `act-environment` ships in the tarball but is missing from the package's
// `exports`, so it can only be reached by path. Derive that path from the
// resolved `.` entry rather than assuming a node_modules layout — pnpm
// symlinks this package and the store path is not stable. (The upstream
// Octane repo aliases the same subpath; worth exporting there instead.)
const testingLibrarySrc = dirname(
  createRequire(import.meta.url).resolve('@octanejs/testing-library'),
)

const octaneAliases = [
  { find: /^@tanstack\/ai-octane$/, replacement: SELF },
  {
    find: /^@octanejs\/testing-library\/(.*)$/,
    replacement: `${testingLibrarySrc}/$1.ts`,
  },
]

export default defineConfig({
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    projects: [
      {
        // The hook modules are .tsrx, so both projects need the Octane
        // compiler — this one with the default client renderer.
        plugins: [octane()],
        resolve: { alias: octaneAliases },
        test: {
          name: 'conformance',
          // happy-dom, not the jsdom the upstream Octane repo used: this repo
          // pins jsdom ^27, whose `Blob` predates `arrayBuffer()` (Octane
          // pins ^29, which has it), and the recorder tests need it. Bumping
          // jsdom for one package would break sherif's cross-package version
          // consistency, and happy-dom is this repo's DOM-testing default.
          environment: 'happy-dom',
          globals: false,
          include: [
            'tests/conformance/**/*.test.ts',
            'tests/conformance/**/*.test.tsx',
          ],
          setupFiles: ['./tests/conformance/test-setup.ts'],
          server: { deps: { inline: inlineDeps } },
        },
      },
      {
        plugins: [octane({ ssr: true })],
        resolve: {
          alias: [
            ...octaneAliases,
            // The compiled .tsrx output imports its runtime from bare
            // `octane`; under SSR that has to resolve to the server runtime.
            { find: /^octane$/, replacement: 'octane/server' },
          ],
        },
        test: {
          name: 'ssr',
          environment: 'node',
          globals: false,
          include: ['tests/ssr/**/*.test.ts'],
          server: { deps: { inline: inlineDeps } },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['src/types.ts', 'src/realtime-types.ts', 'src/**/*.d.ts'],
    },
  },
})
