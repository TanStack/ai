import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = defineConfig({
  ssr: {
    noExternal: ['@tanstack/ai-solid-ui'],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      debug: path.resolve(__dirname, 'src/debug-shim.ts'),
      extend: path.resolve(__dirname, 'src/extend-shim.ts'),
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteSolid({ ssr: true }),
  ],
})

export default config
