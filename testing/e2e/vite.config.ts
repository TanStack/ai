import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { durableDeliveryWebSocketPlugin } from './src/lib/durable-delivery-ws-plugin'

const config = defineConfig({
  // Server-side only fix. @elevenlabs/elevenlabs-js ships a top-level
  // `function getHeader(…)` that collides with h3's auto-imported
  // `getHeader` when vite inlines it into the SSR bundle. The SDK is
  // only imported by server routes (api.tts*.ts, api.transcription*.ts),
  // so tree-shaking already keeps it out of the client bundle — this
  // option only affects the SSR build, where we want the SDK resolved at
  // runtime via require() instead of inlined into the rollup chunk.
  ssr: {
    external: ['@elevenlabs/elevenlabs-js', '@tanstack/store'],
  },
  // Router 1.159 calls `new Store(state, { onUpdate })` (Store 0.8).
  // ai-client uses Store 0.11 `createAtom`. Vite prebundling them into one
  // `@tanstack_store.js` makes hydration throw `actionsFactory is not a function`.
  optimizeDeps: {
    exclude: ['@tanstack/store'],
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    durableDeliveryWebSocketPlugin(),
    nitroV2Plugin({
      externals: {
        external: ['@elevenlabs/elevenlabs-js'],
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
