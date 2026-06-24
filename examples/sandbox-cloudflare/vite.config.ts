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
// NO tunnel needed for local agent runs. The two host surfaces are reached without
// a public hostname locally (see `resolveBridgeOrigin` / `resolvePreviewHost`):
//   • Bridge (container → Worker `/_bridge`): `host.docker.internal:3001` — the
//     container reaches the host machine via the Docker host gateway.
//   • Preview (browser → Worker → container): `http://<port>-<id>-<token>.localhost:3001`
//     — browsers resolve `*.localhost` to loopback with zero DNS setup.
// `allowedHosts` below lets Vite's dev server accept both. (Deployed previews need a
// custom domain with a `*.<domain>` route — `*.workers.dev` has no wildcard.)
export default defineConfig({
  server: {
    // Bind ALL interfaces (not just 127.0.0.1) so the sandbox container can reach
    // the dev server at `host.docker.internal:3001` for the `/_bridge` callback.
    // Default loopback-only binding is why that call gets ECONNREFUSED.
    host: true,
    // Accept the bridge callback host and the `*.localhost` preview subdomains.
    allowedHosts: ['host.docker.internal', '.localhost'],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
