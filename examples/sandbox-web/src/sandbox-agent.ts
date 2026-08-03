/**
 * The sandbox agent — ONE fixed stack: **Claude Code** (the `claude` CLI)
 * running in a **Docker** sandbox. Ask it to build a self-contained TanStack
 * Start app; it scaffolds inside the sandbox, runs the dev server, and hands
 * back a live preview URL.
 *
 * The stack is deliberately not configurable. This app is the runnable demo of
 * [durable runs](../../../docs/sandbox/durable-runs.md), and durability's one
 * hard requirement is that a run be reconstructible from its `runId` alone (the
 * takeover route and the reaper have nothing else) — a fixed stack makes that
 * rebuild trivial (see `run-durable.ts`). For the same wiring switched across
 * harnesses live in the UI, see `examples/sandbox-cloudflare`.
 *
 * Docker is same-machine, so host tools (`tanstackStartRecipe`,
 * `exposePreview`) are BRIDGED into the agent over MCP and it mints the preview
 * URL on demand once its dev server is up.
 */
import { toolDefinition } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { z } from 'zod'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  SandboxDefinition,
  SandboxEnsureContext,
} from '@tanstack/ai-sandbox'

/** Docker base image override (`node:22` ships node + npm + git). */
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'node:22'

/** The model the in-sandbox `claude` CLI runs. */
export const CLAUDE_MODEL = 'claude-opus-4-8'

/**
 * Installs the Claude Code CLI in the fresh container. `--include=optional`
 * matters: without it npm may skip the platform-specific native binary,
 * leaving a `claude` that errors "native binary not installed".
 */
const CLAUDE_CLI_INSTALL_COMMAND =
  'npm install -g @anthropic-ai/claude-code --include=optional'

/**
 * The ONE dev-server port the agent's app must bind. The preview is wired to
 * exactly this port (published at create), so the recipe + guidance below tell
 * the agent to use it.
 */
export const PREVIEW_PORT = 5173

/**
 * The harness adapter `chat()` runs. Claude Code's one spawn path is the
 * journaling NDJSON stream (`claude -p --output-format stream-json`), so
 * durable runs need no protocol override — a detached run's journal is always
 * there to take over.
 */
export function buildAdapter(): AnyTextAdapter {
  return claudeCodeText(CLAUDE_MODEL)
}

/**
 * Required env vars that are not set. The `claude` CLI authenticates
 * headlessly via `ANTHROPIC_API_KEY`.
 */
export function missingEnv(): Array<string> {
  return process.env.ANTHROPIC_API_KEY ? [] : ['ANTHROPIC_API_KEY']
}

// ---------------------------------------------------------------------------
// Scaffolding recipe + preview guidance
// ---------------------------------------------------------------------------

const SCAFFOLD =
  'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)'

const APP =
  'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.'

/** Run step: bind wide, then call `exposePreview` for the URL. */
const RUN = `FIRST, so the published host port reaches the dev server, add \`server: { host: true, allowedHosts: true }\` to the app's \`vite.config.ts\` (bind all interfaces + accept any host). THEN start the dev server bound to all interfaces on PORT ${PREVIEW_PORT} — it MUST be ${PREVIEW_PORT}, because that is the port wired to the preview: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\` (or \`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\`). Once it is listening, call the \`exposePreview\` tool with \`{ "port": ${PREVIEW_PORT} }\` to get a preview URL and share it with the user. The app runs with ZERO configuration — no API keys or env needed.`

/**
 * The recipe as a bridged host tool. The agent sees it over MCP and calls it
 * BEFORE scaffolding.
 */
export const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The canonical recipe for building a self-contained TanStack Start app in this sandbox that runs with no env or API keys: scaffold via `npx --yes @tanstack/cli create … --intent`, what to build, and how to bind/expose the dev server for a preview URL. Call this BEFORE scaffolding.',
  inputSchema: z.object({
    section: z
      .enum(['scaffold', 'app', 'run', 'all'])
      .describe('Which part of the recipe you need (use "all" first).'),
  }),
}).server(({ section }) => {
  const recipe = { scaffold: SCAFFOLD, app: APP, run: RUN }
  return section === 'all' ? recipe : { [section]: recipe[section] }
})

/**
 * System-prompt preview guidance: bind wide on {@link PREVIEW_PORT}, then call
 * `exposePreview` for the URL.
 */
export const PREVIEW_GUIDANCE: string = [
  'PREVIEW SERVERS: to show the user a running web app, start its dev server bound',
  `to 0.0.0.0 on port ${PREVIEW_PORT} (this is the ONLY port exposed to the host, so`,
  `it must be ${PREVIEW_PORT}), then call the \`exposePreview\` tool with`,
  `\`{ "port": ${PREVIEW_PORT} }\`. It returns a preview URL the user can open.`,
  'Bind all interfaces and allow all hosts in the dev-server config before starting:',
  '• Vite — `server: { host: true, allowedHosts: true }` in vite.config.',
  "• webpack-dev-server — `allowedHosts: 'all'` (and `host: '0.0.0.0'`).",
  'Once it is listening, call `exposePreview`, then share the URL.',
].join('\n')

// ---------------------------------------------------------------------------
// The sandbox definition
// ---------------------------------------------------------------------------

/** One sandbox per thread (`reuse: 'thread'`), rebuildable from the threadId. */
export function buildSandbox(threadId: string): SandboxDefinition {
  const key = process.env.ANTHROPIC_API_KEY
  return defineSandbox({
    id: `sandbox-web-${threadId}`,
    provider: dockerSandbox({
      image: SANDBOX_IMAGE,
      // The preview port, published at create.
      publishPorts: [PREVIEW_PORT],
    }),
    workspace: defineWorkspace({
      // No source to clone — the agent scaffolds a fresh app.
      source: { type: 'none' },
      setup: ({ serial }) => serial(CLAUDE_CLI_INSTALL_COMMAND),
      secrets: createSecrets(key ? { ANTHROPIC_API_KEY: key } : {}),
    }),
    lifecycle: { reuse: 'thread' },
  })
}

/**
 * The `exposePreview` server tool for one run. Minting a preview URL is a
 * HOST-side call (`handle.ports.connect`), so the in-sandbox agent calls this
 * bridged tool instead. Resumes the run's sandbox by `threadId` (a no-op
 * `ensure`, since `withSandbox` already created it) and resolves the host-port
 * URL.
 */
export function makeExposePreviewTool(
  definition: SandboxDefinition,
  threadId: string,
  // The caller's shared instance bookkeeping, so this resolves the run's REAL
  // sandbox instead of minting a fresh one (a definition's fallback store is
  // per-definition, and definitions are rebuilt per request).
  bookkeeping?: Pick<SandboxEnsureContext, 'store' | 'locks'>,
) {
  return toolDefinition({
    name: 'exposePreview',
    description: `Expose a port a dev server is listening on inside the sandbox and return a preview URL to show the user. Call this AFTER the server is up and listening on port ${PREVIEW_PORT}.`,
    inputSchema: z.object({
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .describe(
          `The port the dev server is listening on, e.g. ${PREVIEW_PORT}.`,
        ),
    }),
  }).server(async ({ port }) => {
    const handle = await definition.ensure({
      threadId,
      runId: 'expose-preview',
      ...bookkeeping,
    })
    const channel = await handle.ports.connect(port)
    return { url: channel.url }
  })
}
