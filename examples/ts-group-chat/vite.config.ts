import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { websocketRpcPlugin } from './chat-server/vite-plugin.js'

export default defineConfig({
  plugins: [
    websocketRpcPlugin(),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
  resolve: {
    dedupe: ['capnweb'],
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['capnweb'],
  },
  ssr: {
    noExternal: ['@tanstack/ai', '@tanstack/ai-anthropic'],
  },
  nitro: {},
})
