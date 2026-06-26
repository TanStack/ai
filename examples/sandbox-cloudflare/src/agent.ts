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
  PREVIEW_GUIDANCE,
  createCloudflareSandboxAgent,
  exposePreviewTool,
} from '@tanstack/ai-sandbox-cloudflare/agent'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { namedCloudflareSandbox } from './sandbox-provider'

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
  run: 'FIRST, so the preview\'s quick-tunnel hostname is accepted, add `server: { host: true, allowedHosts: true }` to the app\'s `vite.config.ts` (Vite rejects unknown hosts by default). THEN start the dev server bound to all interfaces on PORT 5173 — NOT 3000 (reserved by the sandbox control plane): `pnpm dev --host 0.0.0.0 --port 5173` (or `npm run dev -- --host 0.0.0.0 --port 5173`). Once it is listening, call the `exposePreview` tool with `{ "port": 5173 }` to get a public preview URL (a Cloudflare quick tunnel) and share it with the user. The app runs with ZERO configuration — no API keys or env needed.',
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
 * The configured agent. `src/server.ts` wires `agent.Coordinator` / `agent.Sandbox`
 * to the `RUN_COORDINATOR` + `Sandbox` bindings in `wrangler.jsonc`, and routes the
 * agent's HTTP surface (`/runs`, `/_bridge`, `/tool-exec`) to `agent.worker`.
 */
export const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  // App-agnostic transport guidance, prepended to every run's system prompt: how to
  // start a dev server whose quick-tunnel preview works (bind wide, allow all hosts
  // so the tunnel hostname is accepted). Package-owned because it's the transport's
  // concern. See `PREVIEW_GUIDANCE`.
  systemPrompts: [PREVIEW_GUIDANCE],
  // `tanstackStartRecipe` (demo-specific scaffold guidance) + the package's
  // `exposePreview` (mint a preview URL for the running app) — both bridged to the
  // in-sandbox agent over `/_bridge`. `exposePreviewTool` closes over the run's
  // `threadId` + `env`, so it is built per run here.
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
      // Named by `threadId` so `exposePreview`'s quick tunnel targets this exact
      // container (and survives DO eviction for `reuse: 'thread'`).
      provider: namedCloudflareSandbox(env.Sandbox, input.threadId),
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
