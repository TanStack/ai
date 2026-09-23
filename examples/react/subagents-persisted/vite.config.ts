import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3100 },
  plugins: [
    // Sends server devtools events to the panel, so steps show there.
    devtools(),
    tailwindcss(),
    tanstackStart({
      router: { routeFileIgnorePattern: '\\.test\\.ts$' },
    }),
    viteReact(),
  ],
})
