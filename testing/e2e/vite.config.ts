import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

const config = defineConfig({
  // Server-side only fix. @elevenlabs/elevenlabs-js ships a top-level
  // `function getHeader(…)` that collides with h3's auto-imported
  // `getHeader` when vite inlines it into the SSR bundle. The SDK is
  // only imported by server routes (api.tts*.ts, api.transcription*.ts),
  // so tree-shaking already keeps it out of the client bundle — this
  // option only affects the SSR build, where we want the SDK resolved at
  // runtime via require() instead of inlined into the rollup chunk.
  ssr: {
    external: ['@elevenlabs/elevenlabs-js'],
  },
  plugins: [
    nitroV2Plugin({
      externals: {
        external: ['@elevenlabs/elevenlabs-js'],
      },
    }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
