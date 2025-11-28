import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { devtools } from '@tanstack/devtools-vite'
const config = defineConfig({
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
  ssr: {
    // These CJS packages don't have proper ESM exports - let Node handle them natively
    external: ['solid-markdown', 'unified', 'extend', 'debug'],
  },
})

export default config
