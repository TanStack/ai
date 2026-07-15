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
// NO tunnel needed for local agent runs — the bridge surface is reached without a
// public hostname:
//   • Bridge (container → Worker `/_bridge`): `host.docker.internal:3001` — the
//     container reaches the host machine via the Docker host gateway.
// Browser-facing PREVIEWS of the agent-built app do NOT go through this dev server:
// `exposePreview` opens a Cloudflare quick tunnel (`*.trycloudflare.com`) served by
// `cloudflared` inside the sandbox. That bypasses Vite's port entirely — previously
// the preview was forced onto `*.localhost:3001` and Vite's dev middleware hijacked
// its `/@vite/client` / `/src/*` / `/@fs/*` requests (serving them from the host,
// not the container), which broke the page. See `PREVIEW_GUIDANCE` / `exposePreviewTool`.
export default defineConfig({
  server: {
    // Bind ALL interfaces (not just 127.0.0.1) so the sandbox container can reach
    // the dev server at `host.docker.internal:3001` for the `/_bridge` callback.
    // Default loopback-only binding is why that call gets ECONNREFUSED.
    host: true,
    // Accept the bridge callback host.
    allowedHosts: ['host.docker.internal'],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
