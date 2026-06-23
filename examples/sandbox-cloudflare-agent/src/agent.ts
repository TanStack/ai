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
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

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
 * The container ships the `tanstack` CLI (see the Dockerfile), so the recipe
 * scaffolds with `tanstack create … --intent` — which both creates a real TanStack
 * Start app and writes TanStack Intent skill mappings into it for coding agents.
 * The bridge still matters for the sandbox-specific bits the generic skill can't
 * know: build a NO-env app and bind/expose the dev server for a preview URL.
 */
const RECIPE = {
  scaffold:
    'Scaffold with the TanStack CLI (it sets up TanStack Intent agent-skill mappings by default): `tanstack create my-app --framework react --no-examples -y`. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)',
  app: 'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.',
  run: 'From the app dir, start the dev server bound to all interfaces (`pnpm dev --host 0.0.0.0 --port 3000`, or `npm run dev -- --host 0.0.0.0 --port 3000`), expose port 3000, and return the sandbox preview URL. It runs with ZERO configuration — no API keys or env needed.',
} as const

const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The canonical recipe for building a self-contained TanStack Start app in this sandbox that runs with no env or API keys: scaffold via the `tanstack` CLI (`tanstack create … --intent`), what to build, and how to bind/expose the dev server for a preview URL. Call this BEFORE scaffolding.',
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
  tools: () => [tanstackStartRecipe],
  // Custom sandbox so we control exactly which env vars are injected into the
  // container. Each `createSecrets` entry becomes an env var the agent — and
  // anything it runs there — can read. The demo app the agent builds needs none;
  // `ANTHROPIC_API_KEY` here is only for the `claude` CLI (the agent itself).
  // Values are pulled from the Worker `env` at run time: set them in `.dev.vars`
  // (local) or `wrangler secret put` (prod). Secrets are injected at
  // create/resume and never written to snapshots.
  //
  // NOTE: a custom sandbox REPLACES the factory default, so keep
  // `ANTHROPIC_API_KEY` (the `claude` CLI needs it). To add a var that isn't
  // already on the env type, extend it and pass it as the type param:
  //   interface AppEnv extends SandboxAgentEnv { OPENAI_API_KEY: string }
  //   createCloudflareSandboxAgent<AppEnv>({ ... })  // then env.OPENAI_API_KEY
  sandbox: (_input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      provider: cloudflareSandbox({
        binding: env.Sandbox,
        previewHostname: env.PUBLIC_HOSTNAME,
      }),
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
