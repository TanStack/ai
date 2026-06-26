import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The `/api/run` route reads ANTHROPIC_API_KEY / VERCEL_* from `process.env`.
// The dev SSR runs in this Vite process, so loading `.env.local` (then `.env`)
// here makes those available without exporting them in the shell. Already-set
// vars win, so a shell `export` still takes precedence.
loadEnv({ path: ['.env.local', '.env'] })

// Plain Node TanStack Start (Nitro server). The whole app runs as one Node
// process: the SSR UI and the `/api/run` route that drives the agent. The sandbox
// itself is REMOTE (a Vercel microVM), so there is no host-side tool-bridge or
// preview proxy to configure — the route just talks to the Vercel API and hands
// the agent a pre-minted public preview URL.
//
// `@vercel/sandbox` is a server-only dependency used exclusively in the
// `/api/run` route. Keep it out of the client bundle and the dev-time dep
// pre-bundler:
//   • `optimizeDeps.exclude` keeps esbuild from scanning it.
//   • `ssr.external` keeps it a runtime require in the SSR build (Nitro traces it
//     into the node-server output, so it resolves at runtime).
const SERVER_ONLY = ['@vercel/sandbox']

export default defineConfig({
  optimizeDeps: { exclude: SERVER_ONLY },
  ssr: { external: SERVER_ONLY },
  build: { rollupOptions: { external: SERVER_ONLY } },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
})
