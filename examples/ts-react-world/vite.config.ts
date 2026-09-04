import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
const reactorWasmJs = join(
  dirname(require.resolve('@reactor-team/js-sdk')),
  'wasm/reactor_wasm.js',
)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    // The SDK loads wasm with a relative `import('./wasm/reactor_wasm.js')`
    // marked `@vite-ignore`. Pre-bundling moves the JS and that import 404s.
    exclude: ['@reactor-team/js-sdk'],
  },
  assetsInclude: ['**/*.wasm'],
  ssr: {
    external: ['@reactor-team/js-sdk'],
  },
  plugins: [
    {
      name: 'reactor-wasm',
      resolveId(id) {
        if (id === './wasm/reactor_wasm.js') return reactorWasmJs
        return undefined
      },
    },
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
  nitro: {},
})
