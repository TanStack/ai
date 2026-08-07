import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

// Native / wasm / binary server-only modules that can't be bundled by esbuild
// or rolldown (isolated-vm is a `.node` addon, the quickjs engines ship wasm,
// esbuild/puppeteer carry platform binaries). They stay external in every pass.
// nitro 3's server build (rolldown) externalizes node_modules but must *resolve*
// each external at build time; under pnpm these live under the isolate adapters'
// nested store dirs, so they're declared as direct dependencies of this example
// (see package.json) so the resolve succeeds. The pure-JS server deps that the
// old nitro-v2 externals list also named (google-auth-library, gaxios, jws,
// gcp-metadata, google-logging-utils, ws, node-fetch, openai) are left to be
// bundled normally — nitro 3 handles them without an explicit external entry.
const SERVER_ONLY_NATIVE = [
  'isolated-vm',
  'esbuild',
  'puppeteer',
  'quickjs-emscripten',
  'quickjs-emscripten-core',
  '@jitl/quickjs-wasmfile-release-asyncify',
  '@jitl/quickjs-wasmfile-release-sync',
  '@jitl/quickjs-wasmfile-debug-asyncify',
  '@jitl/quickjs-wasmfile-debug-sync',
  'quickjs-bun',
]

/**
 * quickjs-bun only publishes `exports["."].bun` (no import/default). Vite/Node
 * package resolution always fails on that map — even with `conditions: ['bun']`
 * under Nitro's module runner (which still hits resolvePackageEntry). Point at
 * the package's `index.ts` on disk and mark it external so the Bun runtime
 * loads it natively (bun:ffi + TypeScript).
 */
function resolveQuickjsBunIndex(): string {
  const starts = [
    dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ]
  for (const start of starts) {
    let dir = start
    for (let i = 0; i < 14; i++) {
      const candidates = [
        join(dir, 'node_modules', 'quickjs-bun', 'index.ts'),
        join(
          dir,
          'packages',
          'ai-isolate-quickjs-bun',
          'node_modules',
          'quickjs-bun',
          'index.ts',
        ),
      ]
      for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new Error(
    'Could not locate quickjs-bun/index.ts. Run pnpm install from the monorepo root.',
  )
}

const quickjsBunIndex = resolveQuickjsBunIndex()

function quickjsBunResolvePlugin(): Plugin {
  return {
    name: 'resolve-quickjs-bun-entry',
    enforce: 'pre',
    resolveId(id) {
      // Bare package or deep imports → absolute entry, always external so the
      // Vite module runner never runInlinedModule()'s quickjs-bun (that path
      // throws strict-mode SyntaxError on Bun-oriented source).
      if (
        id === 'quickjs-bun' ||
        id.startsWith('quickjs-bun/') ||
        id === quickjsBunIndex ||
        id.endsWith('/quickjs-bun/index.ts') ||
        id.includes('/quickjs-bun/src/')
      ) {
        return { id: quickjsBunIndex, external: true }
      }
      return null
    },
  }
}

/** `CODE_MODE_BUN=1` or running the Vite CLI under Bun enables Bun isolate defaults. */
const codeModeBun =
  process.env.CODE_MODE_BUN === '1' ||
  typeof (process.versions as { bun?: string }).bun === 'string'

const config = defineConfig({
  define: {
    // Client UI defaults (selected isolate VM) follow the same flag.
    'import.meta.env.VITE_CODE_MODE_BUN': JSON.stringify(
      codeModeBun ? '1' : '',
    ),
    'import.meta.env.VITE_CODE_MODE_DEFAULT_VM': JSON.stringify(
      process.env.CODE_MODE_DEFAULT_VM ?? '',
    ),
  },
  resolve: {
    tsconfigPaths: true,
    // Client must prefer `browser` over `bun`. router-core's isServer maps
    // `bun` → server build (isServer=true); if the browser gets that, hydrate
    // crashes on router.state. quickjs-bun is handled by the plugin + ssr.conditions.
    conditions: ['import', 'module', 'browser', 'default'],
    alias: {
      // Belt-and-suspenders for static analysis / tools that don't use resolveId
      'quickjs-bun': quickjsBunIndex,
    },
  },
  plugins: [
    quickjsBunResolvePlugin(),
    devtools(),
    // Bun-optimized server only when in Bun mode — default Node Nitro for `pnpm dev`.
    // https://bun.com/docs/guides/ecosystem/tanstack-start
    nitro(codeModeBun ? { preset: 'bun' } : {}),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    external: SERVER_ONLY_NATIVE,
    resolve: {
      // Always allow `bun` on the server so quickjs-bun resolves when the
      // process is actually Bun (even without CODE_MODE_BUN).
      conditions: ['bun', 'node', 'import', 'module', 'default'],
    },
  },
  optimizeDeps: {
    exclude: ['isolated-vm', 'quickjs-emscripten', 'quickjs-bun'],
  },
})

export default config
