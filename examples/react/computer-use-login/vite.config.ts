import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Server routes read process.env. Vite does not copy unprefixed .env keys
// into the SSR process. Load them here. Already-set vars win.
for (const name of ['.env.local', '.env']) {
  const path = resolve(import.meta.dirname, name)
  if (existsSync(path)) process.loadEnvFile(path)
}

// The Docker provider uses `dockerode`. It loads native addons that the
// bundler cannot inline, so the server loads it from node_modules.
const SERVER_ONLY = ['dockerode']

export default defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { exclude: SERVER_ONLY },
  ssr: { external: SERVER_ONLY },
  build: { rollupOptions: { external: SERVER_ONLY } },
  server: { port: 3100 },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
