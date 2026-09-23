import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3100 },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: { routeFileIgnorePattern: '\\.test\\.ts$' },
    }),
    viteReact(),
  ],
})
