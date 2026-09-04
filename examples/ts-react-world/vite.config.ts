import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  ssr: {
    external: ['@reactor-team/js-sdk'],
  },
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
  nitro: {},
})
