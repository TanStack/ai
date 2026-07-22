import { defineConfig } from 'vite'
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
]

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    external: SERVER_ONLY_NATIVE,
  },
  optimizeDeps: {
    exclude: ['isolated-vm', 'quickjs-emscripten'],
  },
})

export default config
