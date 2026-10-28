import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { devtools } from '@tanstack/devtools-vite'
import { webSocketChatPlugin } from './src/lib/websocket-chat-plugin.ts'

// Server routes read process.env. Vite does not copy unprefixed .env keys
// into the SSR process. Load them here. Already-set vars win.
for (const name of ['.env.local', '.env']) {
  const path = resolve(import.meta.dirname, name)
  if (existsSync(path)) process.loadEnvFile(path)
}

// `dockerode` is a server-only dependency that pulls in optional native addons
// (`ssh2` → `cpu-features`, a `.node` binary that this install does not compile).
// At runtime `ssh2` catches the missing addon, but the bundlers don't:
//   • esbuild's dev-time dep pre-bundler (`optimizeDeps`) hard-errors trying to
//     resolve `cpufeatures.node` → `optimizeDeps.exclude` keeps it out of the scan.
//   • the SSR build would try to inline it → `ssr.external` keeps it a runtime
//     require.
// This example uses nitro 3. Its server build (rolldown) externalizes
// node_modules by default, but must resolve each external to a real path.
// Under pnpm these server-only deps are only reachable via a workspace
// adapter's nested store dir, so a bare resolve from this example fails —
// they are therefore declared as direct dependencies here (dockerode,
// @anthropic-ai/sdk, @elevenlabs/elevenlabs-js) so nitro can resolve and
// trace them. The vite-level guards below still cover the client/SSR passes.
//
// `@anthropic-ai/sdk` (via @tanstack/ai-claude-code) ships a
// `tools/agent-toolset/fs-util.mjs` sub-module that imports `node:crypto`,
// `node:fs`, `node:path` — hard build errors if Rollup tries to resolve them
// in the client bundle. The SDK is only used server-side; mark it external so
// both the client Rollup pass and the SSR/nitro build resolve it at runtime.
// `@ngrok/ngrok` (used by src/ngrok-bridge.ts to tunnel the tool bridge to cloud
// sandboxes) loads a platform-specific `.node` native binary — esbuild's
// optimizer has no loader for it and the SSR/nitro builds must not inline it.
const SERVER_ONLY_NATIVE = ['dockerode', '@anthropic-ai/sdk', '@ngrok/ngrok']

// Dev-only workaround for a nitro dev-middleware heuristic.
//
// `nitro/dist/_build/vite.dev.mjs` decides whether a request is a static asset
// (and so must NOT reach the server) from `Sec-Fetch-Dest`:
//
//   isAsset = fetchDest && fetchDest !== 'empty'
//     ? !/^(?:document|iframe|frame)$/.test(fetchDest)
//     : isAssetByExt
//
// Anything that isn't a document — `image`, `audio`, `video`, `script`, `font`
// — is treated as an asset and falls through to vite's static middleware,
// which has no file to serve and 404s with the connect `Cannot GET` page. The
// extension branch is only consulted when the header is absent/`empty`, so
// renaming the route doesn't help.
//
// It only bites routes nitro sees under Start's catch-all `/**` (an explicitly
// registered nitro route short-circuits the check), which is every server route
// here. So `<img src="/api/artifacts?id=…">` 404s in dev while the same URL
// fetched from JS returns the bytes — and production is unaffected, since this
// middleware only exists in the vite dev server.
//
// Presenting `empty` for our own API paths routes them back to the server
// without changing what the browser actually sends.
const nitroServeApiToSubresources = {
  name: 'nitro-serve-api-to-subresources',
  enforce: 'pre',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/api/')) req.headers['sec-fetch-dest'] = 'empty'
      next()
    })
  },
} as const satisfies import('vite').PluginOption

const config = defineConfig({
  optimizeDeps: { exclude: SERVER_ONLY_NATIVE },
  // Server-side only fix. @elevenlabs/elevenlabs-js ships a top-level
  // `function getHeader(…)` that collides with h3's auto-imported
  // `getHeader` when vite inlines it into the SSR bundle. The SDK is
  // only imported by server-side adapter factories (see
  // `src/lib/server-audio-adapters.ts`), so tree-shaking already keeps
  // it out of the client bundle — this option only affects the SSR
  // build, where we want the SDK resolved at runtime via require()
  // instead of inlined into the rollup chunk.
  // `dockerode` is also SSR-externalized (see comment above).
  ssr: {
    external: ['@elevenlabs/elevenlabs-js', ...SERVER_ONLY_NATIVE],
  },
  // Keep `dockerode` external in every Rollup pass (the Nitro server build has its
  // own, which `ssr.external` doesn't reach). The client build never imports it, so
  // this is a no-op there.
  build: { rollupOptions: { external: SERVER_ONLY_NATIVE } },
  resolve: { tsconfigPaths: true },
  plugins: [
    nitroServeApiToSubresources,
    devtools(),
    webSocketChatPlugin(),
    nitro(),
    tailwindcss(),
    tanstackStart({
      router: { routeFileIgnorePattern: '\\.test\\.ts$' },
    }),
    viteReact(),
  ],
})

export default config
