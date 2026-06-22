/**
 * The whole app — one `createCloudflareSandboxAgent()` call.
 *
 * The factory returns the run coordinator Durable Object, the `@cloudflare/sandbox`
 * Sandbox DO, and the Worker fetch handler; this file just wires those exports to
 * the `wrangler.jsonc` bindings (`RUN_COORDINATOR` + `Sandbox`). Everything the
 * old hand-written `coordinator.ts` / `run-log-do.ts` / router did — driving
 * `chat()` in the DO, the durable resumable run-log, the hibernatable WebSocket
 * tail, and the MCP `/_bridge` tool endpoint — now lives inside
 * `@tanstack/ai-sandbox-cloudflare`.
 *
 * NOTE: Workers-runtime code — compile-only, not runtime-verified in this repo.
 * See the README Limitations section.
 */
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * One inline demo host tool. It's a `chat()` server tool, so the factory bridges
 * it to the in-sandbox agent over the DO-served MCP endpoint; the agent sees it
 * as `mcp__tanstack__lookup`, the DO runs it on the host, and the result streams
 * back. Returning it from `tools` is what exercises the `/_bridge` path.
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

const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  // No `workspace` here on purpose: the factory's default sandbox injects
  // ANTHROPIC_API_KEY from `env` at run time (a static workspace can't read env),
  // clones no source, and reuses one sandbox per thread.
  tools: () => [lookup],
})

export const RunCoordinator = agent.Coordinator
export const Sandbox = agent.Sandbox
export default agent.worker
