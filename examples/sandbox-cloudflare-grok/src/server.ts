/**
 * Custom Cloudflare Workers entry point — the whole app in one Worker.
 *
 * TanStack Start's default Worker entry only serves the SSR app. To ALSO ship the
 * sandbox agent's Durable Objects + container in the same deploy, we use the
 * documented escape hatch: a custom `src/server.ts` (wired via `wrangler.jsonc`
 * `main`) that re-exports the DO classes and wraps the Start `fetch` handler.
 *
 *   • `RunCoordinator` / `Sandbox` named exports → the wrangler DO + container
 *     bindings.
 *   • `default.fetch` composes three handlers, in order:
 *       1. `proxyToSandbox` — sandbox preview-port traffic, routed by hostname.
 *       2. the agent Worker (`agent.worker`) — the agent's HTTP surface
 *          (`POST /runs`, `GET /runs/:id/stream`, `/_bridge`, `/tool-exec`). The
 *          container calls back on the root-level `/_bridge` + `/tool-exec` paths
 *          (built from `PUBLIC_HOSTNAME`), so those roots are reserved for it.
 *       3. TanStack Start (`handler.fetch`) — the UI + its `/api/*` routes.
 *
 * Binding types come from `worker-configuration.d.ts` (`pnpm cf-typegen`); the
 * env *shape* the agent expects is this app's `AppEnv` (the package's harness-
 * agnostic `SandboxAgentEnv` plus the app's `XAI_API_KEY`).
 *
 * @see https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
 */
import handler from '@tanstack/react-start/server-entry'
import { proxyToSandbox } from '@cloudflare/sandbox'
import { agent } from './agent'
import type { AppEnv } from './agent'

// Re-exported so the DO + container `class_name`s in wrangler.jsonc
// (`RunCoordinator`, `Sandbox`) resolve in the Worker bundle.
export const RunCoordinator = agent.Coordinator
export const Sandbox = agent.Sandbox

/** Root paths owned by the agent Worker; everything else falls through to Start. */
const AGENT_PATHS = ['/runs', '/_bridge', '/tool-exec']

const ownedByAgent = (pathname: string): boolean =>
  AGENT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

export default {
  async fetch(request, env, ctx) {
    // 1. Sandbox preview-port traffic is routed by hostname, so it gets first
    //    refusal on every request before any path-based routing.
    const proxied = await proxyToSandbox(request, env)
    if (proxied) return proxied

    // 2. The agent's own HTTP surface. `agent.worker` is built by the package's
    //    `createSandboxAgentWorker`, so its `fetch` is always present.
    const { pathname } = new URL(request.url)
    if (ownedByAgent(pathname) && agent.worker.fetch) {
      return agent.worker.fetch(request, env, ctx)
    }

    // 3. The TanStack Start app (UI + `/api/*` server routes). Start's handler
    //    takes the request (its 2nd arg is an SSR-context option, not the Worker
    //    env); bindings are read ambiently via the Cloudflare Vite plugin.
    return handler.fetch(request)
  },
} satisfies ExportedHandler<AppEnv>
