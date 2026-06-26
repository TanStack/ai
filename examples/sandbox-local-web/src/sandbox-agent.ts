/**
 * The sandbox agent — switchable across harness adapters AND sandbox providers.
 *
 * Two independent axes, each picked by an env var, showing off the
 * provider-agnostic design: the same `chat()` + `withSandbox()` wiring, the same
 * bridged host tools (`tanstackStartRecipe`, `exposePreview`), and the same
 * preview flow work no matter which combination you choose.
 *
 *   HARNESS = claude-code | opencode      (which coding agent runs in the sandbox)
 *   SANDBOX = docker      | local         (where it runs)
 *
 * Defaults: `claude-code` on `docker`. Every combination drives the same UI.
 *
 * - **Harness** is a `@tanstack/ai-*` harness adapter. Both run their own agent
 *   loop + native tools inside the sandbox and bridge our `chat()` host tools in
 *   over MCP. They differ only in the CLI installed and (opencode) an extra server
 *   port to publish.
 * - **Sandbox** is a `@tanstack/ai-sandbox-*` provider. `docker` isolates in a
 *   container (the CLI is installed on first create; ports are published to the
 *   host). `local` runs on the host with no isolation (fast dev loop; the CLI must
 *   already be on your PATH, and the dev server is reachable at 127.0.0.1 directly).
 *
 * Prereqs: `ANTHROPIC_API_KEY` (both harnesses use an Anthropic model). `docker`
 * needs a running Docker daemon; `local` needs the chosen CLI (`claude` /
 * `opencode`) on your PATH.
 */
import { toolDefinition } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { opencodeText } from '@tanstack/ai-opencode'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { z } from 'zod'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { SandboxDefinition, SandboxProvider } from '@tanstack/ai-sandbox'

/** The conventional sandbox workspace root (both providers map `/workspace`). */
const WORKDIR = '/workspace'

/**
 * The ONE dev-server port the agent's app must bind. For `docker` it is the only
 * container port published to the host, so the agent MUST use exactly this port;
 * `exposePreview` connects to it. The recipe + guidance below say so.
 */
export const PREVIEW_PORT = 5173

/** The in-sandbox `opencode serve` port — published (docker) so the host SDK can reach it. */
const OPENCODE_PORT = 4096

/** The base image override for the Docker provider (`node:22` ships node + npm + git). */
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'node:22'

// ---------------------------------------------------------------------------
// Harness axis
// ---------------------------------------------------------------------------

export type HarnessName = 'claude-code' | 'opencode'

interface HarnessSpec {
  /** Build the harness adapter for the chosen workspace dir. */
  adapter: () => AnyTextAdapter
  /** CLI install run once in the container on first create (docker only). */
  installCommand: string
  /** Extra container ports the provider must publish for this harness (docker). */
  extraPublishPorts: Array<number>
}

const HARNESSES: Record<HarnessName, HarnessSpec> = {
  'claude-code': {
    adapter: () => claudeCodeText('sonnet'),
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    extraPublishPorts: [],
  },
  opencode: {
    adapter: () =>
      opencodeText('anthropic/claude-sonnet-4-5', {
        directory: WORKDIR,
        // Isolated sandbox → let the harness edit + run without prompting (matches
        // the Claude Code adapter's `bypassPermissions` sandbox default).
        permissionMode: 'bypassPermissions',
      }),
    installCommand: 'npm install -g opencode-ai',
    // The host `@opencode-ai/sdk` client connects to `opencode serve` in the
    // container, so its port must be reachable from the host.
    extraPublishPorts: [OPENCODE_PORT],
  },
}

function isHarness(value: string | undefined): value is HarnessName {
  return value === 'claude-code' || value === 'opencode'
}

export const harnessName: HarnessName = isHarness(process.env.HARNESS)
  ? process.env.HARNESS
  : 'claude-code'

const harness = HARNESSES[harnessName]

/** The configured harness adapter, consumed by the `/api/run` route. */
export const adapter: AnyTextAdapter = harness.adapter()

// ---------------------------------------------------------------------------
// Sandbox axis
// ---------------------------------------------------------------------------

export type SandboxName = 'docker' | 'local'

export const sandboxName: SandboxName =
  process.env.SANDBOX === 'local' ? 'local' : 'docker'

function makeProvider(): SandboxProvider {
  if (sandboxName === 'local') {
    // Runs on the host — no isolation, no port publishing (the dev server is
    // reachable at 127.0.0.1 directly). The chosen CLI must be on your PATH.
    return localProcessSandbox()
  }
  return dockerSandbox({
    image: SANDBOX_IMAGE,
    // Publish the preview port + any harness-specific port to random host ports.
    publishPorts: [PREVIEW_PORT, ...harness.extraPublishPorts],
  })
}

// ---------------------------------------------------------------------------
// Host tools + guidance (shared across every combination)
// ---------------------------------------------------------------------------

/**
 * The demo host tool: the canonical recipe for scaffolding a **self-contained**
 * TanStack Start app — one that runs with NO env vars, API keys, or external
 * services, so its preview URL works with zero setup. Bridged into the in-sandbox
 * agent over MCP; the agent calls it BEFORE scaffolding.
 */
const RECIPE = {
  scaffold:
    'Scaffold with the TanStack CLI via npx (no global install needed — run it EXACTLY like this): `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. The package is `@tanstack/cli` (it ships the `tanstack` bin); do NOT guess other package names. `--intent` writes TanStack Intent agent-skill mappings for coding agents. This creates a TanStack Start app and installs deps. (Add `--no-install` to skip install, or `--add-ons <id,…>` for integrations — but keep it env-free; do NOT add auth/database add-ons that need keys.)',
  app: 'Turn it into a SELF-CONTAINED interactive app — NO external APIs, NO env vars, NO keys. Pick something visual: a kanban board, a sortable dashboard over a bundled data.json, a markdown notepad, a drawing pad, or a small game (e.g. Game of Life). Keep all state client-side (persist to localStorage). Make it look polished.',
  run: `FIRST, so the published host port reaches the dev server, add \`server: { host: true, allowedHosts: true }\` to the app's \`vite.config.ts\` (bind all interfaces + accept any host). THEN start the dev server bound to all interfaces on PORT ${PREVIEW_PORT} — it MUST be ${PREVIEW_PORT}, because that is the only port published to the host: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\` (or \`npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}\`). Once it is listening, call the \`exposePreview\` tool with \`{ "port": ${PREVIEW_PORT} }\` to get a local preview URL and share it with the user. The app runs with ZERO configuration — no API keys or env needed.`,
} as const

export const tanstackStartRecipe = toolDefinition({
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
 * System-prompt guidance for exposing a dev server as a browser preview. The
 * provider publishes (docker) or directly exposes (local) the port; the agent
 * binds wide on {@link PREVIEW_PORT} and calls `exposePreview`, which returns the
 * matching local URL.
 */
export const PREVIEW_GUIDANCE: string = [
  'PREVIEW SERVERS: to show the user a running web app, start its dev server bound',
  `to 0.0.0.0 on port ${PREVIEW_PORT} (this is the ONLY port exposed to the host, so`,
  `it must be ${PREVIEW_PORT}), then call the \`exposePreview\` tool with`,
  `\`{ "port": ${PREVIEW_PORT} }\`. It returns a local preview URL the user can open.`,
  'Bind all interfaces and allow all hosts in the dev-server config before starting:',
  '• Vite — `server: { host: true, allowedHosts: true }` in vite.config.',
  "• webpack-dev-server — `allowedHosts: 'all'` (and `host: '0.0.0.0'`).",
  'Once it is listening, call `exposePreview`, then share the URL.',
].join('\n')

// ---------------------------------------------------------------------------
// The sandbox definition (harness × provider)
// ---------------------------------------------------------------------------

/**
 * One sandbox per thread (so a follow-up message resumes the same workspace),
 * built from the selected provider. On `docker` we install the chosen harness CLI
 * during setup; on `local` we skip it (the CLI is on your host PATH already).
 * `ANTHROPIC_API_KEY` is injected as a secret for the in-sandbox CLI.
 */
export const sandbox: SandboxDefinition = defineSandbox({
  id: `sandbox-agent-${harnessName}-${sandboxName}`,
  provider: makeProvider(),
  workspace: defineWorkspace({
    // No source to clone — the agent scaffolds a fresh app.
    source: { type: 'none' },
    setup: ({ serial }) => {
      // On the local-process provider the agent uses the host's own CLI, so we
      // must NOT `npm install -g` onto the host. On docker, install into the
      // fresh container (once per thread; pre-bake a SANDBOX_IMAGE to skip it).
      if (sandboxName === 'docker') serial(harness.installCommand)
    },
    // Injected at create, never written to snapshots/logs. The demo app needs no
    // keys; this is only for the in-sandbox CLI itself.
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread' },
})

/**
 * Build the `exposePreview` server tool for one run. Minting a preview URL is a
 * HOST-side call (`handle.ports.connect`), so the in-sandbox agent can't do it
 * from bash — it calls this bridged tool instead. We resume the run's sandbox by
 * `threadId` (a no-op `ensure`, since `withSandbox` already created it) and
 * resolve the published-/host-port URL.
 */
export function makeExposePreviewTool(
  definition: SandboxDefinition,
  threadId: string,
) {
  return toolDefinition({
    name: 'exposePreview',
    description: `Expose a port a dev server is listening on inside the sandbox and return a local preview URL to show the user. Call this AFTER the server is up and listening on port ${PREVIEW_PORT}.`,
    inputSchema: z.object({
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .describe(`The port the dev server is listening on, e.g. ${PREVIEW_PORT}.`),
    }),
  }).server(async ({ port }) => {
    const handle = await definition.ensure({ threadId, runId: 'expose-preview' })
    const channel = await handle.ports.connect(port)
    return { url: channel.url }
  })
}
