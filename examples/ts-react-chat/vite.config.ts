import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { devtools } from '@tanstack/devtools-vite'

const config = defineConfig({
  // Server-side only fix. @elevenlabs/elevenlabs-js ships a top-level
  // `function getHeader(…)` that collides with h3's auto-imported
  // `getHeader` when vite inlines it into the SSR bundle. The SDK is
  // only imported by server-side adapter factories (see
  // `src/lib/server-audio-adapters.ts`), so tree-shaking already keeps
  // it out of the client bundle — this option only affects the SSR
  // build, where we want the SDK resolved at runtime via require()
  // instead of inlined into the rollup chunk.
  ssr: {
    external: ['@elevenlabs/elevenlabs-js'],
  },
  plugins: [
    devtools(),
    nitroV2Plugin({
      externals: {
        external: ['@elevenlabs/elevenlabs-js'],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
