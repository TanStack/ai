import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

// Native / wasm / binary server-only modules that can't be bundled by esbuild
// or rolldown. They stay external so the host runtime loads them.
// Under pnpm, declare them as direct deps of this example so nitro can resolve
// them (see package.json).
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
  // Bun-native QuickJS (exports.bun only) — host Bun loads it, not Vite.
  'quickjs-bun',
  '@tanstack/ai-isolate-quickjs-bun',
  'bun:ffi',
]

/** `CODE_MODE_BUN=1` or running the Vite CLI under Bun enables Bun isolate defaults. */
const codeModeBun =
  process.env.CODE_MODE_BUN === '1' ||
  typeof (process.versions as { bun?: string }).bun === 'string'

/**
 * Same lessons as the Bun Code Mode path:
 *
 * - Do **not** put `bun` in top-level `resolve.conditions`. router-core's
 *   `isServer` maps `bun` → server build; the browser would get isServer=true,
 *   createRouter never builds a store, hydrateStart crashes on `router.state`.
 * - Put `bun` only on `ssr.resolve.conditions` so `quickjs-bun` resolves under Bun.
 * - Externalize quickjs-bun + the isolate driver so Vite never inlines them.
 *
 * `pnpm dev:bun` → CODE_MODE_BUN=1 bun --bun vite dev
 */
export default defineConfig({
  define: {
    'import.meta.env.VITE_CODE_MODE_BUN': JSON.stringify(
      codeModeBun ? '1' : '',
    ),
    'import.meta.env.VITE_CODE_MODE_DEFAULT_VM': JSON.stringify(
      process.env.CODE_MODE_DEFAULT_VM ?? '',
    ),
  },
  resolve: {
    tsconfigPaths: true,
    // Client: browser/import only — never prefer `bun` here.
    conditions: ['import', 'module', 'browser', 'default'],
  },
  plugins: [
    devtools(),
    // https://bun.com/docs/guides/ecosystem/tanstack-start
    nitro(codeModeBun ? { preset: 'bun' } : {}),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    external: SERVER_ONLY_NATIVE,
    resolve: {
      // Server under Bun: need `bun` for quickjs-bun's export map.
      conditions: ['bun', 'node', 'import', 'module', 'default'],
    },
  },
  optimizeDeps: {
    exclude: [
      'isolated-vm',
      'quickjs-emscripten',
      'quickjs-bun',
      '@tanstack/ai-isolate-quickjs-bun',
    ],
  },
})
