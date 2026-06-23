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
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * One inline demo host tool. It's a `chat()` server tool, so the factory bridges it
 * to the in-sandbox agent over the DO-served MCP endpoint: the agent sees it as
 * `mcp__tanstack__lookup`, the DO runs it on the host, and the result streams back.
 * Returning it from `tools` is what exercises the `/_bridge` path.
 */
const lookup = toolDefinition({
  name: 'lookup',
  description:
    "Look up this project's house rules. Call it before writing code so your changes match the conventions.",
  inputSchema: z.object({
    topic: z.string().describe('What you are about to do, e.g. "naming"'),
  }),
}).server(({ topic }) => ({
  topic,
  rules: [
    'Use arrow functions assigned to const, never function declarations.',
    'Prefer single quotes and no semicolons.',
  ],
}))

/**
 * The configured agent. `src/server.ts` wires `agent.Coordinator` / `agent.Sandbox`
 * to the `RUN_COORDINATOR` + `Sandbox` bindings in `wrangler.jsonc`, and routes the
 * agent's HTTP surface (`/runs`, `/_bridge`, `/tool-exec`) to `agent.worker`.
 */
export const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  // No `workspace` here on purpose: the factory's default sandbox injects
  // ANTHROPIC_API_KEY from `env` at run time (a static workspace can't read env),
  // clones no source, and reuses one sandbox per thread.
  tools: () => [lookup],
})
