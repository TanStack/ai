/**
 * The sandbox agent — one `createCloudflareSandboxAgent()` call.
 *
 * The factory returns the run-coordinator Durable Object, the `@cloudflare/sandbox`
 * Sandbox DO, and a stateless Worker fetch handler. `src/server.ts` re-exports the
 * two DOs (so wrangler can bind them) and composes `agent.worker` with the TanStack
 * Start request handler so the whole thing — UI + agent + container — ships as one
 * Worker.
 *
 * This is the DEFAULT `do-drives` model: the coordinator DO runs `chat()` itself and
 * serves the MCP tool-bridge from its own `fetch` handler; the container only runs
 * the `claude` CLI. The package also supports a `colocated` mode (the harness loop
 * runs inside the container) — see the README and `docs/sandbox/overview.md` for the
 * tradeoff; this example intentionally shows the simpler `do-drives` path.
 *
 * NOTE: Workers-runtime code — it compiles against the real Cloudflare + TanStack AI
 * types, but the end-to-end container run is only exercised on a real Cloudflare
 * deploy (see the README "Limitations").
 */
import {
  createCloudflareSandboxAgent,
  resolvePreviewHost,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import { getSandbox } from '@cloudflare/sandbox'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { namedCloudflareSandbox } from './sandbox-provider'
import type {
  SandboxAgentEnv,
  StartRunInput,
} from '@tanstack/ai-sandbox-cloudflare/agent'

/**
 * The demo host tool: the canonical recipe for scaffolding a **self-contained**
 * TanStack Start app — one that runs with NO env vars, API keys, or external
 * services, so its sandbox preview URL works for anyone with zero setup.
 *
 * It's a `chat()` server tool, so the factory bridges it to the in-sandbox agent
 * over the DO-served MCP endpoint — the agent (Claude Code) sees it as
 * `mcp__tanstack__tanstackStartRecipe`, calls it BEFORE scaffolding, the DO runs
 * it on the host, and the result streams back. Returning it from `tools` is what
 * exercises the `/_bridge` path.
 *
 * The recipe scaffolds via `npx --yes @tanstack/cli create … --intent` — no global
 * install needed in the container image (npm/npx ship on the base image) — which
 * both creates a real TanStack Start app and writes TanStack Intent skill mappings
 * into it for coding agents. The bridge still matters for the sandbox-specific bits
 * the generic skill can't know: build a NO-env app and bind/expose the dev server
 * for a preview URL.
 */
const RECIPE = {
  scaffold:
    'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)',
  app: 'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.',
  run: 'From the app dir, start the dev server bound to all interfaces on PORT 5173 — do NOT use port 3000, it is reserved by the sandbox control plane (`pnpm dev --host 0.0.0.0 --port 5173`, or `npm run dev -- --host 0.0.0.0 --port 5173`). Once it is listening, call the `exposePreview` tool with `{ "port": 5173 }` to get a public preview URL, then share that URL with the user. The app runs with ZERO configuration — no API keys or env needed.',
} as const

const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The canonical recipe for building a self-contained TanStack Start app in this sandbox that runs with no env or API keys: scaffold via `npx --yes @tanstack/cli create … --intent`, what to build, and how to bind/expose the dev server for a preview URL. Call this BEFORE scaffolding.',
  inputSchema: z.object({
    section: z
      .enum(['scaffold', 'app', 'run', 'all'])
      .describe('Which part of the recipe you need (use "all" first).'),
  }),
}).server(({ section }) =>
  section === 'all' ? RECIPE : { [section]: RECIPE[section] },
)

/**
 * Host tool that turns "the agent started a dev server" into a viewable preview.
 *
 * `exposePort` is a HOST-side call on the Sandbox DO stub, so the in-sandbox agent
 * can't make it from bash — it calls this bridged tool instead. We address the run's
 * container by `threadId` (the `namedCloudflareSandbox` provider pins it to that
 * name), expose the port, and return the public URL. `proxyToSandbox` in
 * `server.ts` routes that hostname back into the container.
 *
 * Closes over the run's `threadId` + the Worker `env`, so it must be built per run
 * inside the `tools` resolver.
 */
const exposePreviewTool = (input: StartRunInput, env: SandboxAgentEnv) =>
  toolDefinition({
    name: 'exposePreview',
    description:
      'Expose a port the dev server is listening on and return a public preview URL to show the user. Call this AFTER the server is up (e.g. `vite dev` on port 3000).',
    inputSchema: z.object({
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .describe('The port the dev server is listening on, e.g. 3000.'),
    }),
  }).server(async ({ port }) => {
    const sandbox = getSandbox(env.Sandbox, input.threadId)
    // Browser-facing preview host: `PREVIEW_HOSTNAME` if set, else derived from the
    // run's trigger request. Local dev → `localhost:3001` (the SDK builds a
    // `*.localhost` URL browsers resolve to loopback — no tunnel). Deployed → a
    // custom domain with a `*.<domain>` route (`*.workers.dev` has no wildcard, so
    // `resolvePreviewHost` throws a clear error there). See `resolvePreviewHost`.
    const { url } = await sandbox.exposePort(port, {
      hostname: resolvePreviewHost(env, input),
    })
    return { url }
  })

/**
 * The configured agent. `src/server.ts` wires `agent.Coordinator` / `agent.Sandbox`
 * to the `RUN_COORDINATOR` + `Sandbox` bindings in `wrangler.jsonc`, and routes the
 * agent's HTTP surface (`/runs`, `/_bridge`, `/tool-exec`) to `agent.worker`.
 */
export const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  // `tanstackStartRecipe` (scaffold guidance) + `exposePreview` (mint a preview URL
  // for the running app) — both bridged to the in-sandbox agent over `/_bridge`.
  tools: (input, env) => [tanstackStartRecipe, exposePreviewTool(input, env)],
  // Custom sandbox so we control (a) the env injected into the container and (b) the
  // container's NAME. We pin the container to the run's `threadId` via
  // `namedCloudflareSandbox` so `exposePreview` can address the same container to
  // expose a port. Each `createSecrets` entry becomes an env var the agent can read;
  // the demo app needs none, so `ANTHROPIC_API_KEY` here is only for the `claude` CLI.
  // Values come from the Worker `env`: set them in `.dev.vars` (local) or
  // `wrangler secret put` (prod). Secrets are injected at create/resume, never
  // written to snapshots.
  //
  // To add a var that isn't already on the env type, extend it and pass it as the
  // type param:
  //   interface AppEnv extends SandboxAgentEnv { OPENAI_API_KEY: string }
  //   createCloudflareSandboxAgent<AppEnv>({ ... })  // then env.OPENAI_API_KEY
  sandbox: (input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      provider: namedCloudflareSandbox(
        env.Sandbox,
        input.threadId,
        // Preview host for `exposePort` (browser-facing). See `resolvePreviewHost`.
        resolvePreviewHost(env, input),
      ),
      workspace: defineWorkspace({
        // No source to clone — the container image already ships the claude CLI.
        source: { type: 'none' },
        secrets: createSecrets({
          ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
          // Add more env here (and to `.dev.vars`), e.g.:
          // OPENAI_API_KEY: env.OPENAI_API_KEY,
        }),
      }),
      // One sandbox per thread, so a follow-up message resumes the same workspace.
      lifecycle: { reuse: 'thread' },
    }),
})
