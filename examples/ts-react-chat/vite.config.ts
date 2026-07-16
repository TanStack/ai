import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { devtools } from '@tanstack/devtools-vite'

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
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
