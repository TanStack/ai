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
 * The demo host tool: the canonical recipe for building a TanStack AI chatbot in a
 * TanStack Start app. It's a `chat()` server tool, so the factory bridges it to the
 * in-sandbox agent over the DO-served MCP endpoint — the agent (Claude Code) sees it
 * as `mcp__tanstack__tanstackAiRecipe`, calls it BEFORE scaffolding, the DO runs it
 * on the host, and the result streams back. Returning it from `tools` is what
 * exercises the `/_bridge` path, and it doubles as real, current guidance so the
 * generated app actually works.
 *
 * The recipe targets the Anthropic adapter on purpose: the sandbox already has
 * `ANTHROPIC_API_KEY` in its env (it's injected for the `claude` CLI), so the chatbot
 * the agent scaffolds can run end-to-end behind a sandbox preview URL with no extra
 * setup.
 */
const RECIPE = {
  packages:
    'pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-anthropic @tanstack/react-start @tanstack/react-router react react-dom',
  server: [
    '// src/routes/api.chat.ts — TanStack Start server route',
    "import { chat, toServerSentEventsResponse } from '@tanstack/ai'",
    "import { anthropicText } from '@tanstack/ai-anthropic'",
    "import { createFileRoute } from '@tanstack/react-router'",
    '',
    "export const Route = createFileRoute('/api/chat')({",
    '  server: {',
    '    handlers: {',
    '      POST: async ({ request }) => {',
    '        const { messages } = await request.json()',
    '        const stream = chat({',
    "          adapter: anthropicText('claude-sonnet-4-6'),",
    '          messages,',
    '        })',
    '        return toServerSentEventsResponse(stream)',
    '      },',
    '    },',
    '  },',
    '})',
    '// ANTHROPIC_API_KEY is already in the sandbox env — no extra config needed.',
  ].join('\n'),
  client: [
    '// src/routes/index.tsx — the chat UI',
    "import { useState } from 'react'",
    "import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'",
    '',
    'const { messages, sendMessage, isLoading } = useChat({',
    "  connection: fetchServerSentEvents('/api/chat'),",
    '})',
    '// Render messages[].parts (text parts), call sendMessage(input) on submit.',
  ].join('\n'),
  run: 'Start the dev server bound to 0.0.0.0 (e.g. `vite dev --host 0.0.0.0 --port 3000`), expose port 3000, and return the sandbox preview URL.',
} as const

const tanstackAiRecipe = toolDefinition({
  name: 'tanstackAiRecipe',
  description:
    'The canonical, current recipe for building a TanStack AI chatbot in a TanStack Start app (packages, server route, client hook, how to run it). Call this BEFORE scaffolding so the generated code matches the real API.',
  inputSchema: z.object({
    section: z
      .enum(['packages', 'server', 'client', 'run', 'all'])
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
  tools: () => [tanstackAiRecipe],
  // Custom sandbox so we control exactly which env vars are injected into the
  // container. Each `createSecrets` entry becomes an env var the agent — and
  // anything it runs there, like the chatbot it scaffolds — can read. Values are
  // pulled from the Worker `env` at run time: set them in `.dev.vars` (local) or
  // `wrangler secret put` (prod). Secrets are injected at create/resume and never
  // written to snapshots.
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
