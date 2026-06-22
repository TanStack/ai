/**
 * The whole co-located app, in one `createCloudflareSandboxAgent` call. The
 * package ships the Worker router, the coordinator DO, the durable run-log, and
 * the `POST /run` wire contract; this file only declares the run config + the
 * demo host tool and re-exports the generated classes.
 *
 * `mode: 'colocated'` → the harness loop + its MCP bridge run INSIDE the
 * container (see `src/container-runner.ts`); this DO stays a thin coordinator
 * that executes host tools. See the package's `/agent` entry + the README.
 *
 * NOTE: compile-only reference — not runtime-verified here (no Workers runtime).
 */
import { createSecrets, defineWorkspace } from '@tanstack/ai-sandbox'
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import type { AnyTool } from '@tanstack/ai'
import type { SandboxAgentEnv } from '@tanstack/ai-sandbox-cloudflare/agent'

/**
 * The ONE demo host tool. Its `execute()` runs in the DO — the in-container
 * agent only ever reaches it via `/tool-exec/:runId`. Swap it for your own
 * DB-/secrets-backed tools; the container sees only the serialized descriptor.
 */
const lookupDocs: AnyTool = {
  name: 'lookup_docs',
  description:
    'Look up a short documentation snippet by topic from the host knowledge base.',
  inputSchema: {
    type: 'object',
    properties: { topic: { type: 'string' } },
    required: ['topic'],
  },
  execute: (args: unknown) => {
    const topic =
      args !== null && typeof args === 'object' && 'topic' in args
        ? String(args.topic)
        : ''
    return Promise.resolve({
      topic,
      snippet: `Docs for "${topic}": served by the DO host tool, not the container.`,
    })
  },
}

const agent = createCloudflareSandboxAgent<SandboxAgentEnv>({
  mode: 'colocated',
  harness: 'claude-code',
  model: 'sonnet',
  workspace: defineWorkspace({
    // The image ships the harness CLI; no source to clone. ANTHROPIC_API_KEY is
    // injected into the container env (never logged) and re-resolved by the
    // in-container runner from that env.
    source: { type: 'none' },
    secrets: createSecrets({ ANTHROPIC_API_KEY: '' }),
  }),
  tools: () => [lookupDocs],
})

export const RunCoordinator = agent.Coordinator
export const Sandbox = agent.Sandbox
export default agent.worker
