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
// `/api/run` route. `optimizeDeps.exclude` keeps Vite's dev dep pre-bundler
// (esbuild) from scanning a server-only Node lib into the client graph.
//
// We deliberately do NOT mark it `ssr.external`: that would leave a bare
// `import "@vercel/sandbox"` in the server build, and `vercel deploy --prebuilt`
// ships only `.vercel/output` with no install step — so the external would be
// MODULE_NOT_FOUND at runtime. Letting Nitro bundle it into the function keeps the
// deployed output self-contained. (Dev is unaffected: Vite auto-externalizes node
// deps for SSR in dev regardless.)
const SERVER_ONLY = ['@vercel/sandbox']

export default defineConfig({
  optimizeDeps: { exclude: SERVER_ONLY },
  plugins: [
    // `vercel.functions.maxDuration` is written into the function's
    // `.vc-config.json` by Nitro's Vercel preset. The agent run streams for
    // minutes (create a microVM, install the `claude` CLI, scaffold + run an
    // app), so we raise it toward Vercel's ceiling. 800s needs Fluid Compute on a
    // Pro/Enterprise plan; Vercel clamps it to the plan limit otherwise. Ignored
    // by the default (node-server) build.
    nitro({ vercel: { functions: { maxDuration: 800 } } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
