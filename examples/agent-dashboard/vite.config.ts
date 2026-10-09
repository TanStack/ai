import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

export default defineConfig({
  plugins: [devtools(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3002,
    host: true,
  },
  build: {
    target: 'es2022',
  },
  ssr: {
    noExternal: [
      '@tanstack/ai',
      '@tanstack/ai-anthropic',
      '@tanstack/ai-harness',
      '@tanstack/ai-persistence',
    ],
  },
  nitro: {},
})
