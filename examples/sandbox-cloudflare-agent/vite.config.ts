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
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
