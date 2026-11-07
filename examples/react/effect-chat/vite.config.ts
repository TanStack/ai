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

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3100 },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
