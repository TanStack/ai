import process from 'node:process'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// TanStack Start on Cloudflare Workers: the Cloudflare Vite plugin runs the app
// (and its Durable Objects + Container) inside `workerd` for both `vite dev` and
// `wrangler deploy`, so the agent's `RunCoordinator`/`Sandbox` DOs and the
// container behave the same locally as in production. The plugin reads bindings
// + the custom `main` (`src/server.ts`) from `wrangler.jsonc`.
//
// `TUNNEL=1` (via `pnpm dev:tunnel`) turns on the plugin's built-in Cloudflare
// Tunnel — it gives the local Worker a public `*.trycloudflare.com` hostname the
// in-sandbox agent's container can reach for the `/_bridge` MCP server (the plugin
// downloads `cloudflared` itself; no separate install). You can also press
// `t + Enter` in a running `pnpm dev` to start one. Point `PUBLIC_HOSTNAME` at the
// printed hostname (or use a named tunnel for a stable one). See the README.
export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      ...(process.env.TUNNEL ? { tunnel: { autoStart: true } } : {}),
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
