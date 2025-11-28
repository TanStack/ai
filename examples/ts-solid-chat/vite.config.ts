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
  // ssr: {
  //   // Don't externalize solid-markdown and its dependencies during SSR
  //   // This ensures both server and client use the same compiled code
  //   noExternal: ['solid-markdown', '@tanstack/ai-solid-ui'],
  // },
})

export default config
