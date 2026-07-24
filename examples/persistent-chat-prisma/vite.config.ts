import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

// The Prisma client + better-sqlite3 driver adapter are server-only and load a
// native addon; keep them out of the client optimizer and resolved at runtime
// on the server rather than inlined into the SSR/client bundle.
const SERVER_ONLY = [
  '@prisma/client',
  '@prisma/adapter-better-sqlite3',
  '@tanstack/ai-persistence-prisma',
]

export default defineConfig({
  optimizeDeps: { exclude: SERVER_ONLY },
  ssr: { external: SERVER_ONLY },
  build: { rollupOptions: { external: SERVER_ONLY } },
  plugins: [nitro(), tanstackStart(), viteReact()],
})
