import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The `/api/run` route reads ANTHROPIC_API_KEY / HARNESS / SANDBOX from
// `process.env`. The dev SSR runs in this Vite process, so loading `.env.local`
// (then `.env`) here makes those available without exporting them in the shell.
// Already-set vars win, so a shell `export` still takes precedence.
loadEnv({ path: ['.env.local', '.env'] })

// Plain Node TanStack Start (Nitro server) — no Cloudflare plugin. The whole app
// runs as one Node process: the SSR UI, the `/api/run` route that drives the
// agent, AND the host-side MCP tool-bridge the in-sandbox `claude` calls back on.
//
// Unlike the Cloudflare example, the tool-bridge is NOT this Vite/Nitro server —
// the Claude Code adapter starts its OWN short-lived HTTP bridge per run (via
// `nodeHttpBridgeProvisioner`) and tells the container to reach it at
// `host.docker.internal:<bridgePort>` (the Docker provider adds the
// `host.docker.internal:host-gateway` mapping by default). So this dev server
// needs no special `host`/`allowedHosts` config.
//
// Browser PREVIEWS of the app the agent builds also bypass this server: the
// Docker provider publishes the container's dev-server port to a random host
// port, and `exposePreview` hands back the matching `http://localhost:<port>`.
//
// `dockerode` is a server-only dependency that pulls in optional native addons
// (`ssh2` → `cpu-features`, a `.node` binary that this install does not compile).
// At runtime `ssh2` catches the missing addon, but the bundlers don't:
//   • esbuild's dev-time dep pre-bundler (`optimizeDeps`) hard-errors trying to
//     resolve `cpufeatures.node` → `optimizeDeps.exclude` keeps it out of the scan.
//   • the SSR build would try to inline it → `ssr.external` keeps it a runtime
//     require. (Nitro 3 already externalizes node_modules into the traced server
//     output by default, so the production build needs no extra config.)
// So `dockerode` is excluded from optimization AND SSR-externalized; it runs only
// in the `/api/run` server route, never in the client bundle.
const SERVER_ONLY_NATIVE = ['dockerode']

export default defineConfig({
  optimizeDeps: { exclude: SERVER_ONLY_NATIVE },
  ssr: { external: SERVER_ONLY_NATIVE },
  // Keep `dockerode` external in every Rollup pass (the Nitro server build has its
  // own, which `ssr.external` doesn't reach). Nitro still traces it into the
  // node-server output, so it resolves at runtime; the client build never imports
  // it, so this is a no-op there.
  build: { rollupOptions: { external: SERVER_ONLY_NATIVE } },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
})
