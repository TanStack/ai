import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { devtools } from '@tanstack/devtools-vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = defineConfig({
  ssr: {
    noExternal: ['@tanstack/ai-solid-ui'],
  },
  resolve: {
    alias: {
      debug: path.resolve(__dirname, 'src/debug-shim.ts'),
      extend: path.resolve(__dirname, 'src/extend-shim.ts'),
    },
  },
  plugins: [
    devtools(),
    nitroV2Plugin(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteSolid({ ssr: true }),
  ],
})

export default config
