import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

// `@tanstack/ai-persistence-drizzle/sqlite` uses Node's built-in `node:sqlite`
// and is server-only; keep it out of the client optimizer / SSR inline so the
// browser bundle never tries to resolve a Node built-in.
export default defineConfig({
  optimizeDeps: { exclude: ['@tanstack/ai-persistence-drizzle'] },
  ssr: { external: ['@tanstack/ai-persistence-drizzle'] },
  plugins: [nitro(), tanstackStart(), viteReact()],
})
