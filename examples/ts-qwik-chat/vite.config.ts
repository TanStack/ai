import { defineConfig } from 'vite'
import { qwikVite } from '@qwik.dev/core/optimizer'
import { qwikRouter } from '@qwik.dev/router/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [qwikRouter(), qwikVite(), tsconfigPaths({ root: '.' })],
  optimizeDeps: {
    exclude: ['@tanstack/ai-qwik'],
  },
  ssr: {
    noExternal: ['@tanstack/ai-qwik'],
  },
  server: {
    headers: {
      'Cache-Control': 'public, max-age=0',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'public, max-age=600',
    },
  },
})
